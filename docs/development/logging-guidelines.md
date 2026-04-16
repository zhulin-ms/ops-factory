# 日志开发规范

## 适用范围

本文档用于约束仓库内服务端日志相关开发，重点适用于基于 Spring Boot 的 Java 服务，例如 `gateway`、`knowledge-service`、`prometheus-exporter`。

目标不是追求“日志越多越好”，而是让日志在排查问题时具备以下特征：

- 能关联请求、任务和关键资源
- 能区分正常摘要、可恢复异常和真正故障
- 能通过配置临时提级，而不是临时改代码
- 不泄露敏感信息，也不制造大量低价值噪音

## 1. 代码层规范

### 1.1 统一日志 API

- 新代码统一使用 `SLF4J API`
  - Java 中使用 `org.slf4j.Logger`
  - Java 中使用 `org.slf4j.LoggerFactory`
- 新代码不要直接依赖具体后端 API
  - 不要在新代码中直接使用 `org.apache.logging.log4j.LogManager`
  - 不要在新代码中直接绑定 Logback 专有 API

说明：

- 运行时可以继续使用 `Log4j2` 作为 backend
- 代码层先收敛到 `SLF4J`，后续更换 backend 时成本更低
- `gateway-service` 与 `knowledge-service` 当前代码层日志 API 已统一到 `SLF4J`

### 1.2 日志上下文优先使用 MDC

以下标识如存在，应优先通过 MDC 传递，而不是在每条日志消息中手工拼接：

- `requestId`
- `traceId`
- `sourceId`
- `documentId`
- `jobId`
- 其他跨方法、跨线程排查需要持续携带的上下文

异步任务、线程池任务如果需要保留这些上下文，必须显式做 MDC 透传。

## 2. 配置入口规范

### 2.1 运行时可调日志配置必须从服务配置入口进入

对于服务自己的日志级别、日志行为开关，配置入口应放在该服务实际使用的配置文件中。

例如：

- `gateway` 的运行时配置入口应由 Spring 直接加载 `gateway/config.yaml`
- `gateway` 的标准日志级别应使用 `logging.level.*`
- `gateway` 的服务专有日志行为开关应使用 `gateway.logging.*`
- `gateway` 默认应提供 `X-Request-Id` 与统一 access log
- `business-intelligence` 的运行时配置入口是 `business-intelligence/config.yaml`
- `business-intelligence` 的标准日志级别应使用 `logging.level.*`
- `business-intelligence` 的服务专有日志行为开关应使用 `business-intelligence.logging.*`
- `knowledge-service` 的运行时配置入口是 `knowledge-service/config.yaml`
- `knowledge-service` 的标准日志级别应使用 `logging.level.*`
- `knowledge-service` 的服务专有日志行为开关应使用 `knowledge.logging.*`
- `application.yaml` 可以用于启用日志框架或指定 `logging.config`
- 但实际可调项，例如 `logging.level.*`、`gateway.logging.*`、`knowledge.logging.*`，应从服务配置入口进入

### 2.2 配置变更必须同步三个位置

如果新增日志相关配置项，必须同时更新：

1. 实际配置入口文件
2. 对应的 `config.yaml.example`
3. 对应的开发或架构文档

不要只改代码和默认值，不更新示例配置与文档。

### 2.3 运行时级别调整优先通过配置或启动参数

临时排查时优先使用以下方式：

- `config.yaml`
- 启动脚本环境变量
- JVM `-Dlogging.level...`

不要为了临时定位问题直接修改代码里的日志级别或插入一次性调试日志后提交。

## 3. 打点位置规范

### 3.1 请求入口

HTTP 服务默认应有统一的 access log，建议在 filter 或 interceptor 层完成，而不是在每个 controller 手工重复记录。

access log 至少应包含：

- method
- path
- status
- duration
- requestId

如果请求头支持外部透传请求标识，优先复用；否则由服务生成并回写响应头。

### 3.2 异常出口

统一异常处理器应负责：

- 4xx 类错误记录 `WARN`
- 5xx 类错误记录 `ERROR`
- 真正故障记录完整堆栈

不要只返回错误响应而没有服务端日志。

### 3.3 业务主链路

核心业务链路应记录摘要日志，通常放在 service 或 facade 层：

- 开始
- 完成
- 失败
- 关键状态变化

摘要日志应包含资源标识与耗时，例如：

- `sourceId`
- `documentId`
- `jobId`
- 导入文件数、成功数、失败数
- 检索命中数
- 执行耗时

不要在 controller 和 service 两层同时记录同一份成功摘要，避免重复。

### 3.4 外部依赖和降级路径

调用外部系统或发生降级时必须有明确日志，例如：

- 远程 embedding 失败后回退本地 embedding
- 远程服务超时
- 文件解析 fallback
- 外部配置缺失导致功能降级

这类日志通常记录为 `WARN`，真正无法恢复且导致请求失败时记录 `ERROR`。

### 3.5 不建议打点的位置

以下位置默认不应大量记录业务日志：

- repository 层的常规查询成功路径
- 高频工具函数的普通调用
- controller 对 service 已经记录过的成功结果重复打点
- 全量文本、markdown、向量、二进制内容等大对象输出

## 4. 日志级别规范

### 4.1 `INFO`

用于记录默认可见的业务摘要和生命周期事件，例如：

- 服务启动摘要
- source / document / job 创建与完成
- 导入、检索、重建等主链路完成摘要
- access log

### 4.2 `WARN`

用于记录可恢复、可重试或需要关注但尚未导致整体失败的问题，例如：

- 输入不合法
- 请求冲突
- 远程依赖回退本地实现
- 部分文档重建失败
- 非预期但被兜底处理的情况

### 4.3 `ERROR`

用于记录真正失败、影响结果正确性或需要人工介入的问题，例如：

- 请求最终失败
- 异步任务失败
- 配置错误导致服务不可用
- 外部依赖故障且没有可接受降级

`ERROR` 默认应带异常堆栈，除非堆栈已经在更上层统一记录。

### 4.4 `DEBUG`

用于临时排查或低频细节信息，例如：

- embedding cache hit/miss 细节
- 重建阶段切换细节
- 局部候选集大小、内部参数摘要

默认关闭，通过配置临时打开。

## 5. 敏感信息与数据体量规范

### 5.1 默认不能进入日志的内容

以下内容默认不得进入日志：

- API key
- password
- token
- cookie
- 授权头
- 完整 query 文本
- 全量文档正文
- markdown 原文
- embedding 向量
- 大段异常请求体

### 5.2 查询文本输出必须有显式开关

如果确实需要输出检索 query 或用户输入，必须满足：

- 默认关闭
- 通过显式配置开关打开
- 文档说明用途和风险

默认建议只记录：

- 长度
- 哈希摘要
- 资源范围
- 返回条数

## 6. 落盘与运行规范

### 6.1 日志职责保持单一主路径

不要让以下职责长期混在一起：

- 应用内部 rolling file
- shell 将 stdout/stderr 重定向到同一业务日志
- 平台侧再次采集同一个文件

如果需要同时保留应用日志和控制台输出，应区分文件用途，避免双写到同一个日志文件。

当前仓库约束：

- `gateway/logs/gateway.log` 是 `gateway` 的唯一主业务日志文件
- `gateway/logs/gateway-stdout-stderr.log` 仅用于后台启动时的 stdout/stderr 捕获，不属于主业务日志
- `business-intelligence/logs/business-intelligence.log` 是 `business-intelligence` 的唯一主业务日志文件
- `knowledge-service/logs/knowledge-service.log` 是 `knowledge-service` 的唯一主业务日志文件
- 后台脚本不应再把 stdout/stderr 追加到同名业务日志文件

### 6.2 日志格式字段建议

统一建议至少包含以下字段：

- timestamp
- level
- service
- thread
- logger
- requestId 或 traceId
- message
- exception stack trace

如果是资源级排查密集服务，建议额外带：

- sourceId
- documentId
- jobId

## 7. 测试要求

只要日志配置、日志框架、日志开关或关键日志行为发生变化，至少补以下一种或多种测试：

- 配置加载测试
  - 校验配置文件中的 `logging.level.*` 与业务日志开关已被 Spring 加载
- 运行时生效测试
  - 校验 logger level 已实际作用到 Log4j2 运行时，而不是只出现在 `Environment`
- 输出行为测试
  - 校验 `DEBUG` 是否被过滤
  - 校验 `INFO` 是否按预期输出
  - 校验敏感字段开关是否生效
- 请求链路测试
  - 校验 `requestId` 生成、透传和 access log 输出

不要只写“有日志文件产生”的黑盒测试，而不验证配置是否真的生效。

## 8. Review Checklist

提交日志相关改动前，至少自检以下问题：

- 是否使用了 `SLF4J` 而不是直接绑定具体 backend API
- 是否把日志可调项放在服务真实配置入口
- 是否同步更新了 `config.yaml.example` 和文档
- 是否避免了 controller/service 双重成功日志
- 是否避免输出敏感信息和大体量原文
- 是否补了配置生效或日志行为测试
- 是否避免把应用日志和 shell 重定向双写到同一文件
