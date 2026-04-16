# gateway 排障指南

## 1. 文档目标

本文档用于帮助开发、测试和运维人员快速定位 `gateway` 的常见问题。

重点覆盖：

- 启动失败
- 健康检查失败
- 请求被 401 / 400 拒绝
- reply / SSE 链路异常
- goosed 实例异常
- 日志级别如何临时提级

如果需要了解接口、进程模型和配置细节，请结合以下文档阅读：

- [docs/architecture/process-management.md](/Users/buyangnie/Documents/GitHub/ops-factory/docs/architecture/process-management.md)
- [docs/architecture/process-management-deep-dive.md](/Users/buyangnie/Documents/GitHub/ops-factory/docs/architecture/process-management-deep-dive.md)
- [docs/development/logging-guidelines.md](/Users/buyangnie/Documents/GitHub/ops-factory/docs/development/logging-guidelines.md)

## 2. 运行入口与关键配置

### 2.1 启停入口

默认通过脚本运行：

```bash
cd gateway
./scripts/ctl.sh startup --background
./scripts/ctl.sh status
./scripts/ctl.sh restart --background
./scripts/ctl.sh shutdown
```

### 2.2 配置入口

`gateway` 的实际运行时配置入口是：

```bash
gateway/config.yaml
```

当前 Spring Boot 会直接加载该文件。脚本只负责：

- 发现配置文件位置
- 进程启停
- health check
- 少量显式环境变量覆盖

重点配置包括：

- `server.*`
- `gateway.*`
- `gateway.logging.*`
- `logging.level.*`

### 2.3 关键日志文件

应用主日志：

```bash
gateway/logs/gateway.log
```

当前设计下，`gateway.log` 是唯一主业务日志文件，由应用内 Log4j2 负责写入与滚动。

后台启动时还可能看到辅助输出捕获文件：

```bash
gateway/logs/gateway-stdout-stderr.log
```

该文件只用于保留后台进程的 `stdout/stderr` 输出，不是常规业务排障入口。默认先看 `gateway.log`；只有启动早期异常、日志框架未接管前输出、或第三方库直接写标准错误时再看它。

代码层说明：

- `gateway-service` 当前代码层统一使用 `SLF4J API`
- 运行时后端仍为 `Log4j2`
- 后续新增或修改日志代码时，应继续遵守该约束

## 3. 基础检查

### 3.1 先看服务是否存活

```bash
cd gateway
./scripts/ctl.sh status
curl -k -H 'x-secret-key: test' https://127.0.0.1:3000/gateway/status
```

如果关闭了 TLS，则把 `https` 改成 `http`。

### 3.2 看端口占用

```bash
lsof -i :3000
```

如果端口被占用，先不要继续查业务接口。

### 3.3 看构建是否正常

```bash
cd gateway
mvn test
```

如果本地修改后连构建都不过，先处理编译或测试问题。

## 4. 日志怎么看

### 4.1 关键字段

当前 `gateway` 日志默认会带：

- `service`
- `requestId`
- `userId`
- `thread`
- `logger`

其中 `requestId` 是排查入口的第一关键字段。

### 4.2 requestId 的使用方式

`gateway` 会自动生成或透传：

```bash
X-Request-Id
```

排障建议：

1. 从响应头获取 `X-Request-Id`
2. 在 `gateway/logs/gateway.log` 中搜索该值
3. 再结合 `agentId`、`userId`、`sessionId`、`port` 继续向下定位

命令示例：

```bash
cd gateway
rg "requestId=xxx" logs/gateway.log
rg "userId=admin" logs/gateway.log
rg "\\[SSE-DIAG\\]" logs/gateway.log
```

### 4.3 access log

每个 HTTP 请求默认会输出一条 access log，包含：

- method
- path
- status
- durationMs
- requestId
- userId（可识别时）

所以如果一个请求完全没有业务日志，至少也应该能先在 access log 中确认它是否真正到达了 gateway。

## 5. 如何临时提级日志

### 5.1 直接改配置文件

在 `gateway/config.yaml` 中修改：

```yaml
logging:
  level:
    root: INFO
    com.huawei.opsfactory.gateway: DEBUG
    org.springframework: WARN
    reactor: WARN
    io.netty: WARN
```

然后重启：

```bash
cd gateway
./scripts/ctl.sh restart --background
```

### 5.2 通过环境变量显式覆盖

脚本仍支持显式环境变量覆盖，例如：

```bash
cd gateway
GATEWAY_PORT=3000 \
GOOSE_TLS=true \
./scripts/ctl.sh restart --background
```

如果只是想临时调日志级别，建议优先直接改 `config.yaml`，不要继续扩展脚本层的配置翻译逻辑。

## 6. 常见问题排查

### 6.1 启动失败

优先检查：

1. `./scripts/ctl.sh status`
2. `logs/gateway.log`
3. `logs/gateway-stdout-stderr.log`
4. `gateway/config.yaml`
5. TLS 配置和 keystore 路径

重点关键词：

- `Failed to start gateway`
- `GatewayProperties loaded`
- `BindException`
- `SSL`
- `keystore`
- `goosed`

常见原因：

- 端口占用
- TLS key store 路径错误
- `gateway.secret-key` 配置错误
- `goosed-bin` 路径不正确

### 6.2 健康检查失败

现象：

- 进程在
- 但 `/gateway/status` 不通过

优先判断：

- gateway 本身未完成初始化
- auth/secret key 问题
- TLS scheme 判断错误

命令：

```bash
curl -k -v -H 'x-secret-key: <secret>' https://127.0.0.1:3000/gateway/status
```

### 6.3 请求被 401 拒绝

检查：

- 是否带了 `x-secret-key`
- 是否带了 query 参数 `key`
- `gateway.secret-key` 是否与请求一致

相关位置：

- `AuthWebFilter`
- access log 中的对应 `requestId`

### 6.4 请求被 400 拒绝

典型场景：

- 缺少 `x-user-id`
- body 非法

检查：

- 是否带了 `x-user-id`
- 是否使用了 `uid` query 参数
- body JSON 是否能正常解析

### 6.5 reply / SSE 链路异常

重点看：

- `ReplyController` 的 `[REPLY]` / `[REPLY-PERF]`
- `SseRelayService` 的 `[SSE-DIAG]`

例如：

```bash
rg "\\[REPLY" logs/gateway.log
rg "\\[SSE-DIAG\\]" logs/gateway.log
```

常见现象与判断：

- `relay START` 有，但没有后续 chunk
  - 先看是不是 goosed 没响应
- `relay TIMEOUT (goosed hung)`
  - 更可能是 goosed 实例卡住或进程异常
- `relay TIMEOUT (LLM slow)`
  - 说明 gateway 仍有数据流或 ping，问题更接近 LLM/上游处理慢
- `relay CONNECTION ERROR`
  - 先查 goosed 进程是否已退出

### 6.6 goosed 实例异常

重点看：

- `InstanceManager`
- `InstanceWatchdog`
- `PrewarmService`

关键日志词：

- `Preparing to spawn goosed`
- `goosed process started`
- `goosed ready`
- `Failed to spawn`
- `Watchdog detected dead instance`
- `Watchdog respawning instance`

建议按以下顺序排：

1. 先按 `agentId:userId` 搜日志
2. 看有没有 `port` / `pid`
3. 看是启动失败、健康检查失败，还是运行中被 watchdog 回收

### 6.7 上游错误 body 是否要打开

默认：

```yaml
gateway:
  logging:
    include-upstream-error-body: false
```

这表示 `GlobalExceptionHandler` 默认只记录：

- status code
- path
- body length

只有在明确需要排查 goosed 返回体时，才建议短时间打开：

```yaml
gateway:
  logging:
    include-upstream-error-body: true
```

排查结束后立即关回去。

### 6.8 SSE chunk preview 是否要打开

默认：

```yaml
gateway:
  logging:
    include-sse-chunk-preview: false
```

这时日志中的 `preview` 会显示为：

```text
<suppressed>
```

只有在明确需要排查 SSE 数据内容时，才建议短时间打开：

```yaml
gateway:
  logging:
    include-sse-chunk-preview: true
    sse-chunk-preview-max-chars: 160
```

仍然建议保持截断，不要放大到完整 chunk。

## 7. 推荐排障顺序

建议按这个顺序走：

1. 先确认 gateway 是否正常启动
2. 再确认当前 `config.yaml` 是否是实际生效配置
3. 获取 `X-Request-Id`
4. 在 `gateway.log` 中按 `requestId` 搜索
5. 如果是 reply / stream 问题，再看 `[REPLY-PERF]` 和 `[SSE-DIAG]`
6. 如果怀疑实例问题，再看 `InstanceManager` / `InstanceWatchdog`
7. 必要时临时调高 `logging.level.*`
8. 必要时短时间打开 `include-upstream-error-body` 或 `include-sse-chunk-preview`

## 8. 后续变更时需要同步更新本文档

以下变更需要同步维护本文档：

- `gateway/config.yaml` 结构变化
- 日志文件路径变化
- `gateway.logging.*` 开关变化
- `requestId` 或 access log 规则变化
- SSE 诊断日志格式变化
