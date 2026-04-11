# QA CLI Agent MCP

## 1. 目标

`qa-cli-agent` 通过 `Knowledge-Cli` MCP 提供一个不依赖向量检索的目录问答能力。它基于配置好的根目录，在该目录下查找文件、搜索文本并读取上下文，然后由 Agent 基于文件证据回答问题。

这条链路与现有 `qa-agent` 的知识库 RAG 能力并行存在，不复用知识库 chunk 引用格式，也不依赖 `knowledge-service`。

## 2. 定位

`qa-cli-agent` 适用于：

- 指定目录下的配置问答
- 指定目录下的代码或脚本定位
- 指定目录下的日志内容分析

它不提供：

- 向量检索
- 远程执行
- 文件写入
- Git 历史读取

## 3. 结构

目录位置：

- `gateway/agents/qa-cli-agent/AGENTS.md`
- `gateway/agents/qa-cli-agent/config/config.yaml`
- `gateway/agents/qa-cli-agent/config/mcp/fs-qa/src/index.js`
- `gateway/agents/qa-cli-agent/config/mcp/fs-qa/src/handlers.js`

## 4. 配置

`Knowledge-Cli` 扩展通过以下配置决定作用域：

- 环境变量：`QA_CLI_ROOT_DIR`
- Agent 配置：`extensions.knowledge-cli.x-opsfactory.scope.rootDir`

当环境变量未设置时，MCP 从 `config.yaml` 中读取 `rootDir`；如果仍未配置，则默认使用 `../data`。

## 5. 工具

当前只暴露 3 个工具：

- `find_files`
- `search_content`
- `read_file`

### 5.1 `find_files`

在配置的根目录内列出候选文件，支持：

- 子目录前缀 `pathPrefix`
- 文件名 glob `glob`
- 返回上限 `limit`

### 5.2 `search_content`

在配置的根目录内搜索文本内容，支持：

- 文本查询 `query`
- 子目录前缀 `pathPrefix`
- 正则开关 `regex`
- 大小写开关 `caseSensitive`
- 返回上限 `limit`

底层优先使用 `rg`，若系统未安装 `rg`，则自动回退到 `grep -R -n`。

### 5.3 `read_file`

读取指定文件的全文或行范围，返回：

- 文件绝对路径
- 起止行号
- 总行数
- 带行号的文本内容

## 6. 安全约束

所有路径访问都必须限制在配置的 `rootDir` 内：

- `pathPrefix` 会在解析后校验是否越界
- `read_file.path` 会在 `realpath` 后校验是否越界
- 若符号链接解析后跳出 `rootDir`，请求会被拒绝

## 7. 引用格式

`qa-cli-agent` 使用单独的文件引用格式：

`[[filecite:INDEX|ABS_PATH|LINE_FROM|LINE_TO|SNIPPET]]`

该格式与现有知识库引用 `{{cite:...}}` 完全区分，前端应分别解析与渲染，避免干扰已有知识库问答展示。
