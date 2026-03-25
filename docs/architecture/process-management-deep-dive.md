# Gateway goosed 进程管理架构

## 1. 概述

Ops Factory Gateway 是一个多租户 AI Agent 管理平台的网关层，负责为每个用户按需启动、管理和回收 goosed 进程实例。核心设计原则：

- **进程级隔离**：每个 `(agentId, userId)` 组合对应一个独立的 goosed 进程，拥有独立的端口、工作目录和环境变量
- **按需启动（Lazy Spawn）**：用户首次请求时才创建进程，避免资源浪费
- **自动回收**：空闲超时后自动停止进程，释放系统资源
- **故障自愈**：崩溃进程自动检测并带退避策略重启

### 整体架构位置

```
Client → Gateway (Spring Boot WebFlux :3000) → goosed 进程 (动态端口)
                   │
                   ├── InstanceManager     进程生命周期管理
                   ├── InstanceWatchdog    健康检查 + 空闲回收
                   ├── RuntimePreparer     运行时目录准备
                   ├── PortAllocator       端口分配
                   ├── PrewarmService      预热服务
                   ├── GoosedProxy         HTTP 代理
                   └── SseRelayService     SSE 流转发
```

## 2. 核心组件

### 2.1 InstanceManager — 进程生命周期中枢

**源码**：`gateway-service/.../process/InstanceManager.java`

InstanceManager 是整个进程管理的核心，负责 goosed 进程的创建、跟踪、停止和回收。

**关键数据结构**：

```java
// 实例注册表：key = "agentId:userId"
ConcurrentHashMap<String, ManagedInstance> instances;

// 每个 key 的 spawn 锁，防止并发创建同一实例
ConcurrentHashMap<String, ReentrantLock> spawnLocks;
```

**核心方法**：

| 方法 | 职责 |
|------|------|
| `getOrSpawn(agentId, userId)` | 获取已有实例或创建新实例（入口方法） |
| `doSpawn(agentId, userId)` | 实际的进程创建逻辑（持锁执行） |
| `stopInstance(instance)` | 优雅停止单个实例 |
| `forceRecycle(agentId, userId)` | 异步强制回收死锁实例 |
| `respawnAsync(agentId, userId, restartCount)` | 异步重启崩溃实例（带退避） |
| `touchAllForUser(userId)` | 刷新用户所有实例的活跃时间 |
| `autoStartResidentInstances()` | Gateway 启动时自动拉起配置的常驻实例 |
| `stopAll()` | Gateway 关闭时停止所有实例 |

### 2.2 ManagedInstance — 实例状态模型

**源码**：`gateway-common/.../model/ManagedInstance.java`

每个 goosed 进程在 Gateway 内的运行时表示：

```java
public class ManagedInstance {
    String agentId;                     // Agent 标识
    String userId;                      // 用户标识
    int port;                           // goosed 监听端口
    long pid;                           // 操作系统进程 ID
    volatile Status status;             // STARTING → RUNNING → STOPPED / ERROR
    volatile long lastActivity;         // 最后活跃时间戳（ms）
    volatile int restartCount;          // 当前重启计数
    volatile long lastRestartTime;      // 上次重启时间戳
    transient Process process;          // Java Process 句柄
    Set<String> resumedSessions;        // 已完成 resume 的 session 集合
}
```

**状态枚举**：

```
STARTING  ──→  RUNNING  ──→  STOPPED
                  │
                  └──→  ERROR
```

- `STARTING`：进程已启动，等待健康检查通过
- `RUNNING`：健康检查通过，可以接收请求
- `STOPPED`：已正常停止（空闲回收、手动停止、或被 forceRecycle）
- `ERROR`：异常状态

**`resumedSessions` 的作用**：goosed 的 session 在首次使用时需要调用 `/agent/resume` 加载 provider 和 extensions。当实例被 forceRecycle 后重建，之前的 resume 状态丢失，需要重新 resume。此字段跟踪哪些 session 已在当前实例上完成 resume，避免重复调用。

### 2.3 InstanceWatchdog — 定时巡检

**源码**：`gateway-service/.../process/InstanceWatchdog.java`

以固定间隔（默认 60s）执行两阶段巡检：

```
@Scheduled(fixedDelay = 60000ms)
watchInstances()
  ├── Phase 1: checkInstanceHealth()  // 检测崩溃进程并重启
  └── Phase 2: reapIdleInstances()    // 回收空闲实例
```

详见第 5、6、7 节。

### 2.4 PortAllocator — 动态端口分配

**源码**：`gateway-service/.../process/PortAllocator.java`

```java
public int allocate() {
    try (ServerSocket socket = new ServerSocket(0)) {
        socket.setReuseAddress(true);
        return socket.getLocalPort();
    }
}
```

- 绑定端口 0，由操作系统分配可用的临时端口
- 立即释放 socket，将端口号交给 goosed 使用
- 每个实例获得独立端口，所有 goosed 进程仅监听 `127.0.0.1`

### 2.5 RuntimePreparer — 运行时目录准备

**源码**：`gateway-service/.../process/RuntimePreparer.java`

为每个 `(agentId, userId)` 创建隔离的工作目录：

```
gateway/users/{userId}/agents/{agentId}/
├── config → ../../../agents/{agentId}/config    (符号链接)
├── AGENTS.md → ../../../agents/{agentId}/AGENTS.md  (符号链接，如存在)
├── data/                                         (goosed 数据目录)
└── uploads/                                      (文件上传目录)
```

**设计要点**：

- `config` 目录使用**符号链接**指向共享的 agent 配置，避免配置文件重复
- `data/` 和 `uploads/` 是每用户独立的，存放 session 数据和上传文件
- 此目录路径会被设为 goosed 的 `GOOSE_PATH_ROOT` 环境变量和进程的工作目录（CWD）
- 使用**相对路径**创建符号链接，保证目录可移动性

### 2.6 PrewarmService — 预热服务

**源码**：`gateway-service/.../process/PrewarmService.java`

在用户首次发起请求时，异步预启动默认 agent（如 `universal-agent`），减少后续请求的冷启动延迟。

```java
public void onUserActivity(String userId) {
    if (!enabled || isSysUser || alreadyWarmed) return;
    // Fire-and-forget: 异步启动默认 agent
    instanceManager.getOrSpawn(defaultAgentId, userId).subscribe(...);
}
```

- 由 `UserContextFilter` 在每次认证请求时触发
- 每个用户在 Gateway 生命周期内只预热一次（`ConcurrentHashMap.newKeySet()` 去重）
- 当用户所有实例被回收后，`clearUser()` 重置预热状态，允许下次再次预热
- 不对 `admin` 用户执行预热

## 3. 进程启动流程

### 3.1 getOrSpawn — 入口方法

```
getOrSpawn(agentId, userId)
│
├── 查找已有实例 instances.get(key)
│   ├── 存在且 process.isAlive()
│   │   └── 在 boundedElastic 线程上执行 isHealthy(port)
│   │       ├── 健康 → touch() + resetRestartCount() → 返回
│   │       └── 不健康 → stopInstance() → 走 doSpawn
│   └── 存在但 process 已死
│       └── 清理 → 走 doSpawn
│
└── 不存在
    └── 在 boundedElastic 线程上执行 doSpawn()
```

注意 `getOrSpawn()` 返回的是 `Mono<ManagedInstance>`，所有阻塞操作都通过 `Schedulers.boundedElastic()` 调度，不会阻塞 Reactor 事件循环。

### 3.2 doSpawn — 进程创建

doSpawn 内部使用 per-key `ReentrantLock` 保护，防止并发创建同一实例：

```
doSpawn(agentId, userId)
│
├── 1. 获取锁 spawnLocks[key].lock()
├── 2. 双重检查：锁内再次查找是否已存在
├── 3. 限额检查
│   ├── 用户实例数 < maxPerUser (默认 5)
│   └── 全局实例数 < maxGlobal (默认 50)
├── 4. RuntimePreparer.prepare() → 创建目录和符号链接
├── 5. 重置卡住的 schedule（resetStuckRunningSchedules）
├── 6. PortAllocator.allocate() → 获取动态端口
├── 7. buildEnvironment() → 构建环境变量
├── 8. ProcessBuilder 启动 goosed
│   ├── 命令: goosedBin agent
│   ├── CWD: runtimeRoot
│   └── redirectErrorStream(true)
├── 9. 启动管道排空线程（daemon）
├── 10. 创建 ManagedInstance(status=STARTING) 并注册
├── 11. waitForReady() → 轮询 /status 直到 200 OK
├── 12. 设置 status=RUNNING
└── 13. 释放锁
```

### 3.3 环境变量注入

goosed 进程的行为完全由环境变量控制，InstanceManager 在启动前构建完整的环境变量 map：

**来源 1 — Agent 配置文件**（`agents/{agentId}/config/config.yaml`）：

```yaml
GOOSE_PROVIDER: openai
GOOSE_MODEL: gpt-4o
# ... 其他 agent 级别配置
```

所有 string/number/boolean 类型的 key-value 直接导出为环境变量。

**来源 2 — Agent 密钥文件**（`agents/{agentId}/config/secrets.yaml`）：

```yaml
OPENAI_API_KEY: sk-xxxx
```

**来源 3 — Gateway 注入的核心变量**：

| 变量 | 值 | 说明 |
|------|-----|------|
| `GOOSE_PORT` | 动态端口 | goosed 监听端口 |
| `GOOSE_HOST` | `127.0.0.1` | 仅本地监听 |
| `GOOSE_SERVER__SECRET_KEY` | gateway.secretKey | goosed API 认证密钥 |
| `GOOSE_PATH_ROOT` | 用户运行时目录 | goosed 工作目录 |
| `GOOSE_DISABLE_KEYRING` | `1` | 禁用系统 keyring |
| `GOOSE_TLS` | `true/false` | 是否启用 TLS |
| `RUST_LOG` | `info,goose=debug,...` | Rust 日志级别 |
| `GOOSE_DEBUG` | `1` | 启用调试模式 |
| `GATEWAY_URL` | `http(s)://127.0.0.1:{port}` | Gateway 回调地址 |

### 3.4 启动健康探测（waitForReady）

进程启动后，Gateway 轮询 goosed 的 `/status` 端点等待就绪：

```
初始间隔: 100ms
退避策略: interval = min(interval * 2, 1000ms)
最大尝试: 30 次（约 3~5 秒）
超时条件: 进程退出 或 达到最大尝试次数
```

每次轮询使用 500ms 的 connect/read timeout。如果进程在等待期间退出，会读取进程输出（最多 4KB）用于错误诊断。

### 3.5 管道排空线程

这是一个关键的防死锁机制：

```java
Thread drainThread = new Thread(() -> {
    try (var in = process.getInputStream()) {
        byte[] buf = new byte[8192];
        while (in.read(buf) != -1) { /* discard */ }
    }
}, "goosed-drain-" + agentId + "-" + userId);
drainThread.setDaemon(true);
drainThread.start();
```

**为什么需要这个线程？**

goosed 内部使用 Rust 的 tracing subscriber，所有日志同时写入文件和 stderr。当 Gateway 作为父进程不读取 goosed 的 stdout/stderr pipe 时：

1. 操作系统 pipe 缓冲区（~64KB）逐渐填满
2. goosed 的 `write(stderr)` 系统调用阻塞
3. 被阻塞的 write 发生在 tokio worker 线程上
4. tokio 运行时所有 worker 线程被阻塞 → **整个 goosed 进程冻结**

排空线程持续读取并丢弃管道内容，确保缓冲区不会满。此线程设为 daemon，随 JVM 退出自动结束。

> 详细的排查过程见 [goosed 管道死锁问题排查](../operations/goosed-pipe-deadlock-postmortem.md)

## 4. 请求路由与代理

### 4.1 请求处理流程

以 `/agents/{agentId}/reply` 为例的完整链路：

```
1. Client POST /agents/{agentId}/reply
   └── AuthWebFilter → 验证 secret key
   └── UserContextFilter → 提取 userId，触发 PrewarmService
   └── ReplyController / CatchAllProxyController

2. Controller 调用 InstanceManager.getOrSpawn(agentId, userId)
   └── 获取或创建 goosed 实例

3. instance.touch() — 更新活跃时间
   instanceManager.touchAllForUser(userId) — 保活用户所有实例

4. ensureSessionResumed(instance, sessionId)
   └── 首次使用的 session 需要 POST /agent/resume

5. SseRelayService.relay(port, "/reply", body)
   └── WebClient POST → goosed:{port}/reply
   └── 流式转发 SSE 事件给客户端
```

### 4.2 GoosedProxy

负责构建到 goosed 实例的 WebClient，处理 TLS（trust-all）和 secret key 注入。对非 SSE 的普通 HTTP 请求（如 `/agent/start`、`/agent/resume`、文件操作等）进行代理转发。

### 4.3 SseRelayService — SSE 流转发

SSE (Server-Sent Events) 是 goosed 返回聊天回复的通信方式。SseRelayService 负责：

- 将 WebClient 收到的 SSE 数据流原样转发给客户端（零拷贝 DataBuffer）
- 区分 Ping 事件和实际内容事件
- 三层超时保护（见第 5.4 节）
- 客户端断开时发送 `/agent/stop` 通知 goosed 中止处理
- 超时时生成合成的 SSE Error 事件返回客户端

## 5. 健康检查机制（多层）

Gateway 对 goosed 实例的健康状态采用四层检查机制，覆盖从启动到运行的全生命周期：

### 5.1 启动阶段 — waitForReady

- **触发时机**：`doSpawn()` 中进程启动后立即执行
- **方式**：轮询 `GET /status`，指数退避 100ms→200ms→...→1000ms
- **上限**：30 次尝试
- **失败处理**：抛出异常，进程创建失败

### 5.2 复用阶段 — getOrSpawn 探测

- **触发时机**：新请求到来，尝试复用已有实例时
- **方式**：先 `process.isAlive()` 快速检查（非阻塞），再 `isHealthy(port)` 探测（阻塞，在 boundedElastic 线程）
- **超时**：3 秒 connect + read timeout
- **失败处理**：stopInstance → doSpawn 创建新实例

### 5.3 周期阶段 — InstanceWatchdog

- **触发时机**：每 60 秒定时执行
- **方式**：遍历所有 RUNNING 实例，检查 `process.isAlive()`
- **失败处理**：stopInstance → respawnAsync（带指数退避）
- **详见**：第 6 节

### 5.4 SSE 阶段 — SseRelayService 超时检测

三层超时保护，针对不同故障场景：

| 层级 | 名称 | 默认值 | 触发条件 | 处理方式 |
|------|------|--------|----------|----------|
| Layer 1 | firstByteTimeout | 120s | 无任何数据到达 | 回收实例（goosed 真正死锁） |
| Layer 2 | idleTimeout | 300s | 有 Ping 但无实际内容 | 返回错误，**不回收**（LLM 慢） |
| Layer 3 | maxDuration | 600s | 单次回复总时长上限 | 终止流 |

**Layer 1 vs Layer 2 的区别至关重要**：
- 如果完全没有数据（chunks=0），说明 goosed 进程本身死锁/卡住，需要 `forceRecycle`
- 如果有 Ping 事件但没有内容，说明 goosed 正常运行但 LLM 响应慢，杀进程是错误的——只需通知客户端超时

## 6. 故障恢复与自动重启

### 6.1 崩溃检测

InstanceWatchdog 每 60 秒执行 `checkInstanceHealth()`：

```
遍历所有 RUNNING 实例
  └── process.isAlive() == false ?
      ├── 是 → 进程已崩溃
      │   ├── 记录退出码
      │   ├── stopInstance() 清理
      │   └── 检查是否可以重启
      └── 否 → 进程正常，跳过
```

### 6.2 指数退避重启

```
退避公式: delay = min(baseDelay × 2^restartCount, 300000ms)

baseDelay = 5000ms (可配置)

重启序列:
  #1: 5s 后重启
  #2: 10s 后重启
  #3: 20s 后重启
  ...
  上限: 300s (5分钟)
```

实际判断逻辑：
```java
long backoffMs = Math.min(baseDelay * (1L << Math.min(restartCount, 20)), 300_000L);
long elapsed = now - instance.getLastRestartTime();
if (elapsed < backoffMs) {
    // 退避时间未到，跳过本轮，等下一个 watchdog 周期
}
```

### 6.3 最大重启次数

- 默认 `maxRestartAttempts = 3`
- 超过上限后停止自动重启，记录错误日志
- **下次用户请求**会通过 `getOrSpawn()` 触发全新的 spawn（restartCount 从 0 开始）

### 6.4 SSE 触发的强制回收

当 SseRelayService 检测到 goosed 完全无响应（firstByteTimeout 超时，chunks=0）：

```java
instanceManager.forceRecycle(agentId, userId);
// → 设置 status=STOPPED，从 instances map 移除
// → ProcessUtil.stopGracefully() 终止进程
// → 下一个 getOrSpawn() 会创建新实例
```

此操作在 `Schedulers.boundedElastic()` 上异步执行，不阻塞 SSE 响应链路。

## 7. 空闲回收

### 7.1 空闲判定

```java
long maxIdleMs = idle.timeoutMinutes * 60_000L;  // 默认 15 分钟
long idleDuration = now - instance.getLastActivity();
if (idleDuration > maxIdleMs) → 回收
```

`lastActivity` 通过 `instance.touch()` 更新，以下场景会触发 touch：

- `getOrSpawn()` 复用已有实例时
- Controller 处理请求时调用 `instance.touch()` 和 `touchAllForUser(userId)`

### 7.2 admin 实例豁免

被配置为常驻实例的 `(agentId, userId)` **不会因空闲而被回收**。这些实例由 Gateway 启动时的 `autoStartResidentInstances()` 创建，但仍保留健康检查、超时回收和异常恢复能力。

### 7.3 优雅停止流程

```java
ProcessUtil.stopGracefully(process, 1000ms)
│
├── 1. process.destroy()        → 发送 SIGTERM
├── 2. Thread.sleep(1000ms)     → 等待 1 秒
└── 3. process.destroyForcibly() → 如果仍然存活，发送 SIGKILL
```

### 7.4 预热状态清理

当某用户的所有实例都被回收后：

```java
prewarmService.clearUser(userId);
// → 从 warmedUsers 集合移除
// → 用户下次请求时会重新触发预热
```

## 8. 实例限制与资源保护

### 8.1 限额控制

| 限制项 | 默认值 | 配置路径 |
|--------|--------|----------|
| 单用户最大实例数 | 5 | `gateway.limits.maxInstancesPerUser` |
| 全局最大实例数 | 50 | `gateway.limits.maxInstancesGlobal` |

超过限额时 `doSpawn()` 抛出 `IllegalStateException`，请求返回错误。

### 8.2 并发 Spawn 保护

per-key `ReentrantLock` 确保同一 `(agentId, userId)` 不会被并发创建多个进程：

```java
ReentrantLock lock = spawnLocks.computeIfAbsent(key, k -> new ReentrantLock());
lock.lock();
try {
    // 双重检查 + spawn 逻辑
} finally {
    lock.unlock();
}
```

锁内执行双重检查（double-check），获取锁后再次确认实例是否已被其他线程创建。

## 9. 配置参考

### 9.1 可配置参数一览

| 参数 | 默认值 | 配置键 | 说明 |
|------|--------|--------|------|
| 空闲超时 | 15 min | `gateway.idle.timeoutMinutes` | 无活动后回收实例 |
| 健康检查间隔 | 60s | `gateway.idle.check-interval-ms` | Watchdog 巡检周期 |
| 重启基础延迟 | 5s | `gateway.idle.restartBaseDelayMs` | 指数退避的初始值 |
| 最大重启次数 | 3 | `gateway.idle.maxRestartAttempts` | 超过后不再自动重启 |
| SSE 首字节超时 | 120s | `gateway.sse.firstByteTimeoutSec` | 无数据则判定死锁并回收 |
| SSE 内容空闲超时 | 300s | `gateway.sse.idleTimeoutSec` | 有 Ping 无内容则通知客户端 |
| SSE 最大时长 | 600s | `gateway.sse.maxDurationSec` | 单次回复硬上限 |
| 单用户实例上限 | 5 | `gateway.limits.maxInstancesPerUser` | — |
| 全局实例上限 | 50 | `gateway.limits.maxInstancesGlobal` | — |
| 预热开关 | true | `gateway.prewarm.enabled` | — |
| 预热默认 Agent | universal-agent | `gateway.prewarm.defaultAgentId` | — |
| goosed 二进制路径 | goosed | `gateway.goosedBin` | — |
| goosed TLS | true | `gateway.gooseTls` | — |
| 优雅停止等待时间 | 1000ms | 硬编码 `GatewayConstants.STOP_GRACE_PERIOD_MS` | — |

### 9.2 配置注入链路

```
gateway/config.yaml          ← 运维人员编辑
       ↓
ctl.sh (读取 YAML，导出 env)
       ↓
java -Dgateway.xxx=yyy        ← Java 系统属性
       ↓
application.yml ${ENV:default} ← Spring Boot 属性绑定
       ↓
GatewayProperties              ← 代码中使用
```

## 10. 已知问题与最佳实践

### 10.1 stderr 管道死锁

**问题**：不读取 goosed stdout/stderr 管道 → 缓冲区满 → goosed write() 阻塞 → tokio 运行时死锁

**解决方案**：启动 daemon 线程持续排空管道内容（见 3.5 节）

**注意**：`RUST_LOG=debug` 会加速管道填满（更多 stderr 输出），安全设置为：
```
RUST_LOG=info,goose=debug,goosed=debug,rmcp=debug
```

### 10.2 Schedule 卡住修复

goosed 持久化 schedule 的 `currently_running=true` 标志，但重启时不会重置。InstanceManager 在 `doSpawn()` 中调用 `resetStuckRunningSchedules()` 修正此状态，避免任务永远处于 "正在运行" 状态无法重新触发。

### 10.3 Session Resume 跟踪

goosed 的 session 在首次使用时需要调用 `/agent/resume`（加载 LLM provider 和 extensions）。ManagedInstance 维护 `resumedSessions` 集合跟踪已 resume 的 session：

- 正常场景：session resume 一次即可，后续请求跳过
- 实例被回收重建后：`resumedSessions` 清空，需要重新 resume
- 此机制防止了不必要的重复 resume 调用

### 10.4 TLS 处理

- goosed 1.27+ 默认启用 TLS（无法关闭），Gateway 使用 trust-all SSL factory 连接
- InstanceManager 在构造时创建 `SSLSocketFactory`（trust-all），用于所有到 goosed 的健康检查连接
- GoosedProxy 的 WebClient 也配置了 trust-all，用于代理请求
