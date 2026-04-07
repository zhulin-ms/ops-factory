# knowledge-service 排障指南

## 1. 文档目标

本文档用于帮助开发、测试和运维人员快速定位 `knowledge-service` 的常见问题。

目标不是覆盖所有实现细节，而是提供一条统一的排障路径：

1. 先确认服务是否正常启动
2. 再确认配置是否正确加载
3. 再查看应用日志和请求关联信息
4. 最后按故障类型进入专项定位

如果需要了解完整配置与接口契约，请参考：

- [docs/architecture/knowledge-service-integration.md](/Users/buyangnie/Documents/GitHub/ops-factory/docs/architecture/knowledge-service-integration.md)
- [docs/development/logging-guidelines.md](/Users/buyangnie/Documents/GitHub/ops-factory/docs/development/logging-guidelines.md)

## 2. 运行入口与关键目录

### 2.1 启停入口

本地和脚本化运行默认使用：

```bash
cd knowledge-service
./scripts/ctl.sh startup --background
./scripts/ctl.sh status
./scripts/ctl.sh restart --background
./scripts/ctl.sh shutdown
```

默认健康检查地址：

```bash
http://127.0.0.1:8092/actuator/health
```

### 2.2 配置入口

`knowledge-service` 的实际运行时配置入口是：

```bash
knowledge-service/config.yaml
```

`application.yaml` 只负责引导 Spring Boot 和启用 `log4j2`，真正的可调运行参数应优先从 `config.yaml` 进入。

重点配置包括：

- `knowledge.runtime.base-dir`
- `knowledge.database.*`
- `knowledge.logging.include-query-text`
- `logging.level.*`
- `ops-knowledge.*`

### 2.3 运行目录

默认运行目录在：

```bash
knowledge-service/data
```

其中通常包含：

- `data/meta/knowledge.db`
- `data/upload/`
- `data/artifacts/`
- `data/indexes/`

如果 `base-dir` 改了，排障时优先确认你看的目录是不是当前实际运行目录。

## 3. 先做基础检查

### 3.1 看服务是否起来

```bash
cd knowledge-service
./scripts/ctl.sh status
curl -fsS http://127.0.0.1:8092/actuator/health
```

如果 `status` 失败，先不要看业务接口，先处理启动问题。

### 3.2 看端口是否被占用

```bash
lsof -i :8092
```

典型现象：

- 端口已被其他进程占用
- 上一次实例残留未退出
- 端口打开但健康检查失败，说明进程在但 Spring 上下文可能未完成初始化

### 3.3 看 Maven 构建是否通过

如果是本地修改后无法启动，先确认构建：

```bash
cd knowledge-service
mvn test
mvn -DskipTests package
```

## 4. 日志怎么看

### 4.1 日志文件位置

后台启动时：

- 应用业务日志：`knowledge-service/logs/knowledge-service.log`
- 控制台与标准错误重定向日志：`knowledge-service/logs/knowledge-service-console.log`

前台启动时：

- 应用会同时输出到控制台和 `knowledge-service/logs/knowledge-service.log`

建议优先看应用业务日志，不要只盯着 console log。

### 4.2 关键日志字段

当前应用日志默认会带以下上下文：

- `service`
- `requestId`
- `sourceId`
- `documentId`
- `jobId`
- `thread`
- `logger`

排障时应优先按这些字段聚合，而不是只按时间顺序人工滚日志。

### 4.3 requestId 如何使用

HTTP 请求会自动生成或透传 `X-Request-Id`。

排障方法：

1. 先从客户端响应头拿 `X-Request-Id`
2. 再在 `knowledge-service.log` 中搜索这个值
3. 结合同一条链路上的 `sourceId` / `documentId` / `jobId` 继续向下查

### 4.4 快速 grep 示例

```bash
cd knowledge-service
rg "requestId=xxx" logs/knowledge-service.log
rg "jobId=job_xxx" logs/knowledge-service.log
rg "sourceId=src_xxx" logs/knowledge-service.log
rg "Failed ingest|Failed to process upload|Source rebuild failed" logs/knowledge-service.log
```

## 5. 如何临时打开排查级别

### 5.1 从配置文件提级

在 `knowledge-service/config.yaml` 中调整：

```yaml
knowledge:
  logging:
    include-query-text: false

logging:
  level:
    root: INFO
    com.huawei.opsfactory.knowledge: DEBUG
    com.huawei.opsfactory.knowledge.service.EmbeddingService: DEBUG
    com.huawei.opsfactory.knowledge.service.SearchService: DEBUG
```

修改后重启服务：

```bash
cd knowledge-service
./scripts/ctl.sh restart --background
```

### 5.2 用环境变量临时提级

如果不想改文件，可以直接：

```bash
cd knowledge-service
KNOWLEDGE_LOG_LEVEL=DEBUG \
KNOWLEDGE_LOG_LEVEL_APP=DEBUG \
KNOWLEDGE_LOG_LEVEL_EMBEDDING=DEBUG \
KNOWLEDGE_LOG_LEVEL_SEARCH=DEBUG \
KNOWLEDGE_LOG_QUERY_TEXT=false \
./scripts/ctl.sh restart --background
```

对应关系：

- `KNOWLEDGE_LOG_LEVEL` -> `logging.level.root`
- `KNOWLEDGE_LOG_LEVEL_APP` -> `logging.level.com.huawei.opsfactory.knowledge`
- `KNOWLEDGE_LOG_LEVEL_EMBEDDING` -> `logging.level.com.huawei.opsfactory.knowledge.service.EmbeddingService`
- `KNOWLEDGE_LOG_LEVEL_SEARCH` -> `logging.level.com.huawei.opsfactory.knowledge.service.SearchService`
- `KNOWLEDGE_LOG_QUERY_TEXT` -> `knowledge.logging.include-query-text`

### 5.3 关于 query 文本开关

`knowledge.logging.include-query-text` 默认建议保持 `false`。

原因：

- 查询文本可能包含用户敏感内容
- 默认日志已经会记录 query 长度和哈希摘要
- 只有在明确需要排查检索表达式本身时，才建议短时间打开

## 6. 常见问题排查

### 6.1 服务启动失败

优先检查：

1. `./scripts/ctl.sh status`
2. `logs/knowledge-service-console.log`
3. `logs/knowledge-service.log`
4. `config.yaml` 是否有错误
5. `data/` 是否有权限问题

重点看这些关键词：

- `Failed to start`
- `Unsupported knowledge.database.type`
- `knowledge.database.url is required`
- `Flyway`
- `Hikari`
- `BindException`

常见原因：

- 端口占用
- `knowledge.database.type` 写错
- PostgreSQL 模式缺少 `knowledge.database.url`
- `base-dir` 无法创建目录
- SQLite 文件或目录没有写权限

### 6.2 健康检查失败，但进程还在

现象：

- 端口可见
- `status` 失败
- `/actuator/health` 不返回 200

优先判断：

- Spring 是否卡在启动阶段
- Flyway 是否正在迁移或失败
- DataSource 是否初始化失败

命令：

```bash
curl -v http://127.0.0.1:8092/actuator/health
tail -n 200 logs/knowledge-service.log
tail -n 200 logs/knowledge-service-console.log
```

### 6.3 导入文件失败

重点看日志里的：

- `Starting ingest`
- `Processed upload`
- `Skipped duplicate upload`
- `Rejected upload`
- `Failed to process upload`
- `Failed ingest`

常见原因：

- 文件类型不在 `ops-knowledge.ingest.allowed-content-types`
- Tika 解析失败
- 上传文件损坏
- `data/upload` 或 `data/artifacts` 无法写入
- 文档重复，按 `sourceId + sha256` 被跳过

建议顺序：

1. 看响应中的 `X-Request-Id`
2. grep 对应 `requestId`
3. 看是否有 `documentId`
4. 再到 `data/upload/<sourceId>/<documentId>/` 和 `data/artifacts/<sourceId>/<documentId>/` 核对产物

### 6.4 检索结果为空或明显不对

先看这些维度：

- 请求是否带了正确的 `sourceIds` / `documentIds`
- `source` 是否处于 `MAINTENANCE` 或 `ERROR`
- 文档是否真的导入并切块成功
- `logging.level.com.huawei.opsfactory.knowledge.service.SearchService` 是否需要临时提到 `DEBUG`

建议检查：

```bash
rg "Search completed|Compare search completed|Retrieve completed|Explain completed" logs/knowledge-service.log
```

如果需要更深入排查检索表达式：

1. 临时打开 `SearchService=DEBUG`
2. 如确有必要，再短时间打开 `knowledge.logging.include-query-text=true`
3. 排查完成后立即恢复默认值

### 6.5 embedding 相关问题

如果怀疑远程 embedding 服务不可用，重点看：

- `Remote embedding failed, falling back to local embeddings`

这条日志说明：

- 当前请求没有直接失败
- 但已经从远程 embedding 降级为本地 embedding
- 检索质量可能变化，尤其是语义召回

建议检查：

- `ops-knowledge.embedding.base-url`
- `ops-knowledge.embedding.api-key`
- 目标服务网络连通性
- timeout 是否合理

### 6.6 source rebuild 卡住或失败

重点看：

- `Queued source rebuild`
- `Starting source rebuild`
- `Failed rebuilding document`
- `Completed source rebuild`
- `Source rebuild failed`

以及按 `jobId` 搜索：

```bash
rg "jobId=job_xxx" logs/knowledge-service.log
```

同时检查接口：

- `GET /knowledge/jobs/{jobId}`
- `GET /knowledge/jobs/{jobId}/failures`
- `GET /knowledge/sources/{sourceId}/maintenance`

常见原因：

- 某个历史原始文件损坏
- 文件仍在，但解析阶段失败
- 索引目录写入异常
- embedding 或切块阶段发生局部失败

### 6.7 日志太多、难以阅读

先不要删日志代码，优先降级：

- `root` 保持 `INFO`
- 只把目标包临时提到 `DEBUG`
- 排查结束后恢复

如果是第三方库过于嘈杂，可在 `config.yaml` 中单独压低该包级别，而不是压全局。

## 7. 排障建议流程

推荐按下面顺序走：

1. 先确认服务是否启动和健康
2. 再确认 `config.yaml` 是否是当前实际生效配置
3. 获取请求的 `X-Request-Id`
4. 在 `knowledge-service.log` 中按 `requestId` / `jobId` / `sourceId` / `documentId` 搜索
5. 必要时临时提级到目标包
6. 排查结束后恢复默认日志级别

不要一开始就全局开 `DEBUG`，也不要在没有 `requestId` 的情况下盲看整份日志。

## 8. 需要同步补充文档的情形

如果后续出现以下变更，应同步更新本文档：

- 日志文件路径变化
- 启动脚本参数变化
- `config.yaml` 中日志配置项变化
- 新增关键 MDC 字段
- 新增高频故障类型或新的排障入口
