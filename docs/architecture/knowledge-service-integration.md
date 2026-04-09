# Knowledge Service 对接说明

## 1. 目标与边界

`knowledge-service` 是 Ops Factory 中独立的知识入库、切块、索引和检索服务，负责：

- 管理知识源（source）
- 接收文档并执行导入
- 产出文档预览和转换产物
- 管理 chunk
- 提供搜索、取回、解释能力
- 管理索引/检索 profile 以及 source 绑定关系

适用范围：

- 其他后端服务需要统一接入知识库检索能力
- 网关或编排服务需要把业务文档导入知识库
- 管理台需要维护 source、document、chunk、profile、job

非边界：

- 不负责前端直连约束的放宽。浏览器侧仍应优先通过 `gateway` 暴露统一入口。
- 不负责用户鉴权、多租户鉴权策略。本服务当前接口本身未定义鉴权头，接入方需要在上层网关统一收口。

## 2. 运行与配置加载

### 2.1 配置来源

服务启动时会加载：

- `knowledge-service/src/main/resources/application.yaml`
- 运行目录下的 `./config.yaml`（`spring.config.import: optional:file:./config.yaml`）

配置分为两类：

- 业务配置：`knowledge.*`
- 运行时存储配置：`knowledge.runtime.*`
- 数据库连接配置：`knowledge.database.*`

### 2.2 本地启动

在服务目录下执行：

```bash
cd knowledge-service
mvn spring-boot:run
```

打包运行：

```bash
cd knowledge-service
mvn package
java -jar target/knowledge-service.jar
```

### 2.3 运行目录

`knowledge.runtime.base-dir` 默认是 `./data`，服务会在该目录下维护：

- `upload/<sourceId>/<documentId>/original/`：上传原始文件
- `artifacts/<sourceId>/<documentId>/`：转换产物，当前为 `content.md`
- `indexes/`：索引目录
- `meta/knowledge.db`：默认 SQLite 模式下的元数据与 embedding 内容缓存

建议：

- 生产环境使用独立磁盘路径，不要和代码目录混放
- 把 `base-dir` 指到可持久化目录
- 上层部署时提前评估磁盘容量，导入文件和转换产物会同时占用空间

## 3. 配置项说明

示例文件见 [knowledge-service/config.yaml.example](/Users/buyangnie/Documents/GitHub/ops-factory/knowledge-service/config.yaml.example)。

### 3.1 运行时配置

```yaml
knowledge:
  runtime:
    base-dir: "./data"
  database:
    type: sqlite
    url: ""
    driver-class-name: ""
    username: ""
    password: ""
    pool:
      max-size: 5
      min-idle: 1
  logging:
    include-query-text: false
```

```yaml
logging:
  level:
    root: INFO
    com.huawei.opsfactory.knowledge: INFO
    com.huawei.opsfactory.knowledge.service.EmbeddingService: WARN
    com.huawei.opsfactory.knowledge.service.SearchService: INFO
```

- `knowledge.runtime.base-dir`
  - 含义：知识服务运行时文件根目录
  - 默认值：`./data`
  - 影响：上传原件、转换产物、索引都会写入这里

- `knowledge.database.type`
  - 含义：数据库类型
  - 当前支持：`sqlite`、`postgresql`
  - 默认值：`sqlite`

- `knowledge.database.url`
  - 含义：JDBC 连接地址
  - 默认行为：当 `type=sqlite` 且该值为空时，自动使用 `${knowledge.runtime.base-dir}/meta/knowledge.db`
  - `postgresql` 模式下必须显式配置

- `knowledge.database.driver-class-name`
  - 含义：JDBC Driver 类名
  - 默认行为：按 `type` 自动推导，通常无需手工配置

- `knowledge.database.username`
- `knowledge.database.password`
  - 含义：外部数据库认证信息
  - SQLite 模式通常留空

- `knowledge.database.pool.max-size`
- `knowledge.database.pool.min-idle`
  - 含义：数据库连接池参数
  - 说明：默认值面向本地和轻量部署，生产环境可按实际并发调整

### 3.1.1 日志与排查配置

`knowledge-service` 当前使用 `SLF4J API + Log4j2 backend`。

默认行为：

- 应用日志由 Log4j2 直接写入 `knowledge-service/logs/knowledge-service.log`
- 脚本后台启动时，标准输出与标准错误单独写入 `knowledge-service/logs/knowledge-service-console.log`
- 日志格式默认带上：
  - `service`
  - `requestId`
  - `sourceId`
  - `documentId`
  - `jobId`
  - `thread`
  - `logger`

配置项：

- `logging.level.root`
  - 含义：全局日志级别
  - 默认值：`INFO`

- `logging.level.com.huawei.opsfactory.knowledge`
  - 含义：knowledge-service 应用代码主日志级别
  - 建议：日常保持 `INFO`，排查复杂问题时再临时切到 `DEBUG`

- `logging.level.com.huawei.opsfactory.knowledge.service.EmbeddingService`
  - 含义：embedding 调用与降级相关日志级别
  - 建议：默认 `WARN`，排查远程 embedding 失败或本地回退时切到 `DEBUG`

- `logging.level.com.huawei.opsfactory.knowledge.service.SearchService`
  - 含义：检索链路日志级别
  - 建议：默认 `INFO`，仅在检索诊断时切到 `DEBUG`

- `knowledge.logging.include-query-text`
  - 含义：是否在检索相关日志中输出原始 query 文本
  - 默认值：`false`
  - 建议：默认关闭，避免敏感查询内容进入日志；默认日志会记录 query 长度和哈希摘要

使用脚本启动时，可通过环境变量临时提级，而不改 `config.yaml`：

```bash
KNOWLEDGE_LOG_LEVEL=DEBUG \
KNOWLEDGE_LOG_LEVEL_APP=DEBUG \
KNOWLEDGE_LOG_LEVEL_EMBEDDING=DEBUG \
KNOWLEDGE_LOG_LEVEL_SEARCH=DEBUG \
KNOWLEDGE_LOG_QUERY_TEXT=false \
./knowledge-service/scripts/ctl.sh restart --background
```

说明：

- `KNOWLEDGE_LOG_LEVEL` 对应 `logging.level.root`
- `KNOWLEDGE_LOG_LEVEL_APP` 对应 `logging.level.com.huawei.opsfactory.knowledge`
- `KNOWLEDGE_LOG_LEVEL_EMBEDDING` 对应 `logging.level.com.huawei.opsfactory.knowledge.service.EmbeddingService`
- `KNOWLEDGE_LOG_LEVEL_SEARCH` 对应 `logging.level.com.huawei.opsfactory.knowledge.service.SearchService`
- `KNOWLEDGE_LOG_QUERY_TEXT` 对应 `knowledge.logging.include-query-text`

### 3.1.2 Schema 初始化与迁移

服务启动时使用 Flyway 执行数据库迁移。

- 迁移目录：`knowledge-service/src/main/resources/db/migration/common`
- 当前迁移职责：
  - `V1__init.sql`：初始化基础表结构
  - `V2/V3`：补齐 source/job 运行态字段
  - `V4`：清理历史遗留表 `embedding_record`

兼容策略：

- 新空库：按版本顺序完整执行迁移
- 已有 SQLite 库：启动时会基线到 `1`，再执行后续增量迁移

建议：

- 后续任何 schema 变化都新增 migration，不要再在 Java 启动代码里做 `alter table` 补丁
- 生产环境切库前先在目标数据库验证 Flyway 迁移链路

### 3.2 业务配置

#### `knowledge.ingest`

- `max-file-size-mb`：单文件最大大小，默认 `100`
- `allowed-content-types`：允许导入的 MIME 类型。当前实现默认支持：
  - `application/pdf`
  - `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  - `application/vnd.openxmlformats-officedocument.presentationml.presentation`
  - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  - `text/plain`
  - `text/markdown`
  - `text/html`
  - `text/csv`
- `deduplication`：去重方式，当前默认 `sha256`
- `skip-existing-by-default`：是否默认跳过已存在文档，当前实现按 `sourceId + sha256` 去重

#### `knowledge.convert`

- `engine`：转换引擎，默认 `tika`
- `enable-pdfbox-fallback`：PDF 回退能力开关
- `extract-metadata`：是否抽取元数据
- `normalize-whitespace`：是否规范空白字符
- `normalize-full-half-width`：是否规范全角/半角
- `keep-markdown-artifact`：是否保留 markdown 产物

#### `knowledge.analysis`

- `language`：语言标记，默认 `zh`
- `index-analyzer`：索引分词器，默认 `smartcn`
- `query-analyzer`：查询分词器，默认 `smartcn`

#### `knowledge.chunking`

- `mode`：切块模式，默认 `hierarchical`
- `target-tokens`：目标 token 数
- `overlap-tokens`：chunk 重叠 token 数
- `respect-headings`：是否按标题层级切分
- `keep-tables-whole`：是否尽量保持表格完整
- `split-long-paragraphs`：是否拆长段落
- `merge-short-paragraphs`：是否合并短段落
- `min-chunk-tokens`：chunk 最小 token 数
- `max-chunk-tokens`：chunk 最大 token 数

#### `knowledge.metadata`

- `extract-keywords`：是否抽关键词
- `max-keywords`：最大关键词数量
- `extract-title-path`：是否抽标题路径
- `extract-summary`：是否抽摘要
- `store-page-refs`：是否保存页码引用

#### `knowledge.embedding`

- `base-url`：embedding 服务地址
- `api-key`：embedding 服务密钥
- `model`：embedding 模型名
- `timeout-ms`：调用超时
- `batch-size`：批处理大小
- `dimensions`：向量维度

说明：

- 语义检索向量主索引存放在 Lucene `indexes/vectors/`
- 数据库中只保留按 `content_hash + model + dimension` 复用的 embedding 缓存
- 文档、chunk、source 删除不会级联清空 embedding 缓存，因为缓存不再绑定单个 chunk id

#### `knowledge.indexing`

- `title-boost`
- `title-path-boost`
- `keyword-boost`
- `content-boost`
- `bm25.k1`
- `bm25.b`
- `store-raw-text`
- `store-markdown`

当前实现中的词法评分逻辑与这些默认权重一致：

- `title = 4.0`
- `titlePath = 2.5`
- `keywords = 2.0`
- `text/content = 1.0`

#### `knowledge.retrieval`

- `mode`：`lexical | semantic | hybrid`
- `lexical-top-k`
- `semantic-top-k`
- `final-top-k`
- `max-top-k`
- `rrf-k`
- `snippet-length`

默认 `max-top-k = 64`，用于限制运行态检索与召回测试 compare 采样的最大候选数。

#### `knowledge.fetch`

- `include-neighbors-by-default`
- `default-neighbor-window`
- `max-neighbor-window`

注意：`GET /knowledge/fetch/{chunkId}` 传入的 `neighborWindow` 不能超过这里的 `max-neighbor-window`。

#### `knowledge.retrieve`

- `expand-context`
- `expand-mode`
- `neighbor-window`
- `max-evidence-count`
- `max-evidence-tokens`
- `include-metadata`
- `include-references`

#### `knowledge.features`

- `allow-chunk-edit`
- `allow-chunk-delete`
- `allow-explain`
- `allow-request-override`

管理台或调用方可以通过系统接口读取这些特性开关，不要在调用方硬编码。

## 4. API 约定

### 4.1 基础约定

- Base Path：
  - 资源管理类接口：`/knowledge`
  - job 接口：`/knowledge/jobs`
- 数据格式：
  - 普通接口：`application/json`
  - 文档导入：`multipart/form-data`
- 分页返回统一结构：

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0
}
```

### 4.2 错误返回

当前统一错误格式：

```json
{
  "code": "RESOURCE_NOT_FOUND",
  "message": "Source not found: src_xxx"
}
```

已实现错误码：

- `RESOURCE_NOT_FOUND`
  - HTTP `404`
  - 典型场景：source/document/chunk/job/profile 不存在
- `REQUEST_FAILED`
  - HTTP `400`
  - 典型场景：`topK` 非法、`neighborWindow` 超限、重试非失败任务、上传内容类型不支持
- `VALIDATION_FAILED`
  - HTTP `400`
  - 典型场景：创建 source 时 `name` 为空或长度超限

### 4.3 状态字段

当前实现中常见状态值如下：

- source.status：`ACTIVE`
- source.storageMode：`MANAGED`
- document.status：`INDEXED | PROCESSING | ERROR`
- document.indexStatus：`INDEXED`
- job.status：`RUNNING | SUCCEEDED | FAILED | CANCELLED`
- chunk.editStatus：`SYSTEM_GENERATED | USER_EDITED`

## 5. 推荐调用流程

### 5.1 最小闭环

其他服务接入时，推荐按以下顺序：

1. 创建 source
2. 上传文档到该 source
3. 轮询文档或 job 状态
4. 使用 `/search` 做命中召回
5. 对命中的 chunk 调 `/fetch` 获取完整内容
6. 或直接调 `/retrieve` 获取适合直接喂给 LLM 的 evidence 列表

### 5.2 管理型场景

如果调用方需要细粒度运营知识库，可额外接入：

1. `/profiles/*` 管理索引/检索 profile
2. `/profiles/bind` 或 `/profiles/bindings/{sourceId}` 绑定 source 与 profile
3. `/documents/*` 和 `/chunks/*` 做文档、chunk 管理
4. `/stats/*` 和 `/jobs/*` 做监控与运维

## 6. API 明细

### 6.1 系统能力接口

#### `GET /knowledge/capabilities`

用途：返回服务支持的检索模式、融合模式、分词器、可编辑字段和特性开关。

典型用途：

- 管理台初始化表单选项
- 其他服务在运行时探测能力，而不是硬编码支持矩阵

#### `GET /knowledge/system/defaults`

用途：返回当前服务生效的业务默认配置视图，包括 ingest、chunking、retrieval、features。

典型用途：

- 管理台展示默认值
- 调用方决定是否显式覆盖请求参数

### 6.2 Source 管理

#### `GET /knowledge/sources`

查询参数：

- `page`
- `pageSize`

#### `POST /knowledge/sources`

请求体：

```json
{
  "name": "report-agent-docs",
  "description": "知识源说明",
  "indexProfileId": "ip_xxx",
  "retrievalProfileId": "rp_xxx"
}
```

说明：

- `name` 必填，最大 64 字符
- 不传 profile 时，会自动绑定系统默认 profile

#### `GET /knowledge/sources/{sourceId}`

获取 source 详情。

#### `PATCH /knowledge/sources/{sourceId}`

可更新字段：

- `name`
- `description`
- `status`
- `indexProfileId`
- `retrievalProfileId`

#### `GET /knowledge/sources/{sourceId}/stats`

返回：

- 文档总数
- 已索引文档数
- 失败文档数
- 处理中文档数
- chunk 总数
- 用户编辑 chunk 数
- 最近一次成功导入时间

#### `POST /knowledge/sources/{sourceId}:rebuild`

用途：按当前 source 绑定的索引配置与系统默认值，重新触发该知识源下文档的处理与索引构建。

返回示例：

```json
{
  "jobId": "job_xxx",
  "sourceId": "src_xxx",
  "status": "SUCCEEDED"
}
```

行为说明：

- 当前可以同步返回成功结果，后续可平滑扩展为异步 job
- 前端只需要根据返回状态给出提交成功提示，不依赖立即完成
- 该接口应继续走 gateway 暴露给浏览器

### 6.3 文档导入与文档管理

#### `POST /knowledge/sources/{sourceId}/documents:ingest`

请求类型：`multipart/form-data`

字段：

- `files`：可重复多次上传多个文件

返回示例：

```json
{
  "jobId": "job_xxx",
  "sourceId": "src_xxx",
  "status": "SUCCEEDED",
  "documentCount": 3
}
```

行为说明：

- 当前导入是同步完成后返回，不是异步排队
- 但仍会记录一条 `INGEST` job，供运维查询
- 基于 `sourceId + sha256` 去重，重复文件会被跳过，不会重复创建 document
- 若文件类型不在允许列表内，会返回 `400`

#### `GET /knowledge/documents`

查询参数：

- `sourceId`：按知识源过滤
- `page`
- `pageSize`

#### `GET /knowledge/documents/{documentId}`

获取文档详情，包括：

- `sha256`
- `contentType`
- `language`
- `status`
- `indexStatus`
- `chunkCount`
- `userEditedChunkCount`

#### `PATCH /knowledge/documents/{documentId}`

可更新字段：

- `title`
- `description`
- `tags`

#### `DELETE /knowledge/documents/{documentId}`

行为：

- 删除文档记录
- 删除其所有 chunk
- 删除上传原件目录
- 删除转换产物目录

#### `GET /knowledge/documents/{documentId}/chunks`

查看文档下的 chunk 列表。

#### `GET /knowledge/documents/{documentId}/preview`

返回：

- `markdownPreview`

适合管理台预览，不适合直接作为检索证据接口。

#### `GET /knowledge/documents/{documentId}/artifacts`

返回该文档是否存在以下产物：

- markdown

#### `GET /knowledge/documents/{documentId}/artifacts/markdown`

直接返回转换后的 markdown 文本。

#### `GET /knowledge/documents/{documentId}/original`

下载导入时保存的原始文件。

#### `POST /knowledge/documents/{documentId}:rebuild`
#### `POST /knowledge/documents/{documentId}:reindex`
#### `POST /knowledge/documents/{documentId}:rechunk`

当前实现会直接生成一条成功状态的 job 记录，作为后续异步化扩展入口。

#### `GET /knowledge/documents/{documentId}/stats`

返回文档维度统计信息。

### 6.4 Chunk 管理

#### `GET /knowledge/chunks`

查询参数：

- `sourceId`
- `documentId`
- `page`
- `pageSize`

#### `GET /knowledge/chunks/{chunkId}`

返回 chunk 详情，包括：

- `title`
- `titlePath`
- `keywords`
- `text`
- `markdown`
- `pageFrom`
- `pageTo`
- `tokenCount`
- `textLength`
- `editStatus`

#### `POST /knowledge/documents/{documentId}/chunks`

用途：手工新增 chunk。

请求体示例：

```json
{
  "ordinal": 999,
  "title": "Manual Validation Chunk",
  "titlePath": ["Manual Validation Chunk"],
  "keywords": ["manual-keyword"],
  "text": "manual-only-term appears in this manually managed chunk",
  "markdown": "## Manual Validation Chunk\n\nmanual-only-term appears in this manually managed chunk",
  "pageFrom": 1,
  "pageTo": 1
}
```

新增后会：

- 立即可搜索
- 刷新文档 chunk 统计
- 标记 `editStatus = USER_EDITED`

#### `PATCH /knowledge/chunks/{chunkId}`

可更新：

- `title`
- `titlePath`
- `keywords`
- `text`
- `markdown`
- `pageFrom`
- `pageTo`

#### `PATCH /knowledge/chunks/{chunkId}/keywords`

只更新关键词，适合轻量运营动作。

#### `DELETE /knowledge/chunks/{chunkId}`

删除 chunk，并同步刷新文档统计。

#### `POST /knowledge/documents/{documentId}/chunks:reorder`

请求体：

```json
{
  "items": [
    { "chunkId": "chk_a", "ordinal": 1 },
    { "chunkId": "chk_b", "ordinal": 2 }
  ]
}
```

用途：重排 chunk 顺序。

#### `POST /knowledge/chunks/{chunkId}:reindex`

当前返回同步成功结果，保留为后续索引重建扩展点。

### 6.5 检索接口

#### `POST /knowledge/search`

用途：返回命中 chunk 的搜索结果列表，适合“先召回、再展示或再取详情”的场景。

请求体：

```json
{
  "query": "incident",
  "sourceIds": ["src_xxx"],
  "documentIds": ["doc_xxx"],
  "retrievalProfileId": "rp_xxx",
  "topK": 8,
  "filters": {
    "contentTypes": ["text/csv"]
  },
  "override": {
    "mode": "hybrid",
    "lexicalTopK": 50,
    "semanticTopK": 50,
    "rrfK": 60,
    "scoreThreshold": 0.3,
    "includeScores": true,
    "includeExplain": false,
    "snippetLength": 180
  }
}
```

当前实现说明：

- `topK` 必须大于 0 且不能超过 `knowledge.retrieval.max-top-k`
- `filters.contentTypes` 会按 document 的 `contentType` 过滤
- `retrievalProfileId` 与 `override` 会共同参与运行时检索参数解析，优先级为 `override > profile > system defaults`
- `mode=lexical` 返回关键词分数路径
- `mode=semantic` 返回语义分数路径
- `mode=hybrid` 固定使用 `RRF` 融合 BM25 / semantic 两路排序，`rrfK` 控制 reciprocal rank fusion 的平滑程度
- `scoreThreshold` 由后端按当前模式的最终分数进行筛选

返回中的关键字段：

- `chunkId`
- `documentId`
- `sourceId`
- `title`
- `snippet`
- `score`
- `lexicalScore`
- `semanticScore`
- `fusionScore`
- `pageFrom`
- `pageTo`

#### `GET /knowledge/fetch/{chunkId}`

查询参数：

- `includeNeighbors`：是否带相邻 chunk
- `neighborWindow`：相邻窗口大小
- `includeMarkdown`
- `includeRawText`

注意：

- 当前实现会校验 `neighborWindow`
- `includeMarkdown` 和 `includeRawText` 参数目前已暴露，但暂未影响返回裁剪

适合场景：

- 命中后取全文
- 拼接上下文
- 管理台查看 chunk 详情

#### `POST /knowledge/retrieve`

用途：直接返回适合喂给 LLM 的 evidence 列表。

请求体：

```json
{
  "query": "incident",
  "sourceIds": ["src_xxx"],
  "retrievalProfileId": "rp_xxx",
  "topK": 3,
  "override": {
    "expandContext": true,
    "expandMode": "ordinal_neighbors",
    "neighborWindow": 1,
    "maxEvidenceCount": 5,
    "maxEvidenceTokens": 3000,
    "includeMetadata": true,
    "includeReferences": true,
    "includeExplain": false
  }
}
```

当前实现说明：

- 内部先走 `/search`，再逐个 `fetch`
- 返回 `evidences[*].content`、`markdown`、`keywords`、`references`
- `override` 中多数参数已预留但尚未完全生效

推荐：

- 需要直接给大模型做 RAG 时优先用这个接口
- 如果你要做自定义重排或前端搜索结果页，优先用 `/search`

#### `POST /knowledge/explain`

用途：解释某个 query 为什么命中某个 chunk。

请求体：

```json
{
  "query": "retrieval_mode",
  "chunkId": "chk_xxx",
  "sourceIds": ["src_xxx"],
  "retrievalProfileId": "rp_xxx"
}
```

当前返回包含：

- `lexical.matchedFields`
- `lexical.score`
- `semantic.score`
- `fusion.mode`
- `fusion.score`

注意：当前 `semantic` 解释仍是占位值，真实解释主要看 `lexical`。

### 6.6 Profile 与 Binding

#### Index Profile

- `GET /knowledge/profiles/index`
- `POST /knowledge/profiles/index`
- `GET /knowledge/profiles/index/{profileId}`
- `PATCH /knowledge/profiles/index/{profileId}`
- `DELETE /knowledge/profiles/index/{profileId}`

#### Retrieval Profile

- `GET /knowledge/profiles/retrieval`
- `POST /knowledge/profiles/retrieval`
- `GET /knowledge/profiles/retrieval/{profileId}`
- `PATCH /knowledge/profiles/retrieval/{profileId}`
- `DELETE /knowledge/profiles/retrieval/{profileId}`

profile 请求体通用格式：

```json
{
  "name": "retrieval-prod",
  "config": {
    "retrieval": {
      "mode": "hybrid",
      "semanticThreshold": 0.47,
      "lexicalThreshold": 0.61
    },
    "result": {
      "finalTopK": 7
    }
  }
}
```

说明：

- `config` 是 `Map<String, Object>` 结构，适合承载扩展配置
- retrieval profile 当前只支持 `retrieval.semanticThreshold` 与 `retrieval.lexicalThreshold`
- `hybrid` 当前没有 profile 级阈值配置；hybrid 主要由两路候选 TopK 和 RRF 排序决定
- 请求 `override.scoreThreshold` 仅在 `semantic / lexical` 模式下参与后端过滤
- `PATCH` 时当前实现是浅合并，不是深合并；同名一级 key 会被整体覆盖
- 删除 profile 前，要确保该 profile 没有被 source 绑定，否则会返回 `400`

#### Binding

- `GET /knowledge/profiles/bindings`
- `POST /knowledge/profiles/bind`
- `PATCH /knowledge/profiles/bindings/{sourceId}`

推荐做法：

- source 创建完成后，如需个性化检索策略，再单独绑定 profile
- 不需要差异化时，直接使用系统默认 profile 即可

### 6.7 Job 与统计接口

#### Job

- `GET /knowledge/jobs`
- `GET /knowledge/jobs/{jobId}`
- `POST /knowledge/jobs/{jobId}:cancel`
- `POST /knowledge/jobs/{jobId}:retry`
- `GET /knowledge/jobs/{jobId}/logs`

注意：

- 当前只有失败状态的 job 允许 retry
- `logs` 当前返回的是基于 job message 生成的简化日志视图

#### Stats

- `GET /knowledge/stats/overview`

用于平台级概览：

- source 数
- document 数
- chunk 数
- 用户编辑 chunk 数
- 运行中 job 数

## 7. 其他服务接入建议

### 7.1 如果你是编排/Agent 服务

推荐接入：

1. 用 source 作为业务域或知识域隔离单位
2. 每类资料建一个 source，例如 `report-agent-docs`、`runbook-library`、`incident-postmortem`
3. 导入时保留原始文件名，便于运维回溯
4. 在线问答优先使用 `/retrieve`
5. 需要引用来源页码或命中 chunk 时，再配合 `/search` 和 `/fetch`

### 7.2 如果你是管理后台

推荐接入：

1. 页面初始化先调 `/capabilities` 和 `/system/defaults`
2. 列表页统一使用分页接口
3. 文档详情页同时展示 `/preview` 和 `/artifacts`
4. chunk 编辑后提示“会立即影响检索结果”
5. 不要把可编辑字段硬编码，使用 `/capabilities.editableChunkFields`

### 7.3 如果你是网关

建议：

- 由网关统一暴露外部稳定接口和鉴权
- 网关可按业务侧需要再封装 source 隔离、调用审计、限流和租户维度控制
- 不建议让浏览器直接绕过网关访问 `knowledge-service`

## 8. cURL 示例

### 8.1 创建 source

```bash
curl -X POST http://127.0.0.1:8080/knowledge/sources \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "report-agent-docs",
    "description": "report agent knowledge base"
  }'
```

### 8.2 上传文档

```bash
curl -X POST http://127.0.0.1:8080/knowledge/sources/src_xxx/documents:ingest \
  -F 'files=@/path/to/sample-knowledge.pdf' \
  -F 'files=@/path/to/sample-runbook.txt'
```

### 8.3 搜索

```bash
curl -X POST http://127.0.0.1:8080/knowledge/search \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "incident",
    "sourceIds": ["src_xxx"],
    "topK": 5
  }'
```

### 8.4 获取 chunk 完整内容

```bash
curl 'http://127.0.0.1:8080/knowledge/fetch/chk_xxx?includeNeighbors=true&neighborWindow=1'
```

### 8.5 直接取 RAG 证据

```bash
curl -X POST http://127.0.0.1:8080/knowledge/retrieve \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "incident",
    "sourceIds": ["src_xxx"],
    "topK": 3
  }'
```

## 9. 当前实现限制

接入方需要明确以下现状：

- 当前搜索实现以词法匹配为主，语义检索相关字段多数仍为扩展位
- `/search.override`、`/retrieve.override`、`retrievalProfileId` 等字段接口已开放，但并非全部参数都已真正生效
- 文档导入当前是同步处理，不是后台异步任务队列
- `includeMarkdown`、`includeRawText` 查询参数已存在，但当前 `fetch` 返回不会按这两个参数裁剪字段
- profile 更新是浅合并，嵌套对象更新时调用方需要传完整一级对象

如果其他服务要基于这些能力做稳定集成，建议只依赖当前已经被测试覆盖的闭环：

- source 创建与查询
- 文档上传、文档查询、产物读取
- chunk CRUD
- `/search`
- `/fetch`
- `/retrieve`
- `/explain`
- `/stats/*`
- `/jobs/*`
