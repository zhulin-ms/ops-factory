# Ops Factory 手工验证测试用例

> **版本**：v2.0
> **更新日期**：2026-03-16
> **适用范围**：Web App、Gateway、Prometheus Exporter、Langfuse、OnlyOffice
> **测试环境要求**：所有服务通过 `./scripts/ctl.sh startup` 正常启动

## 自动化覆盖说明

本文档 v1.0 包含 87 个手工测试用例。经 2026-03-16 的 Playwright E2E 自动化测试（127 个测试，100% 通过），覆盖情况如下：

| 模块 | 原始用例数 | 自动化覆盖 | 仍需手工验证 |
|------|-----------|-----------|-------------|
| Web App (TC-WEB) | 42 | 32 fully + 7 partial | 10 |
| Gateway API (TC-GW) | 28 | 14 fully + 10 partial | 9 |
| Prometheus Exporter (TC-PROM) | 12 | 0 | 12 |
| Langfuse (TC-LF) | 16 | 1 fully + 2 partial | 14 |
| OnlyOffice (TC-OO) | 13 | 0 | 13 |
| E2E 集成 (TC-E2E) | 9 | 1 fully + 4 partial | 7 |

> 自动化报告详见 `test/report/e2e-test-report.md`

**以下仅列出自动化未覆盖、部分覆盖、或建议人工复查的测试用例。**

## 优先级说明

| 优先级 | 含义 | 涉及模块 |
|--------|------|----------|
| **P1** | 核心功能，必须通过 | Web App、Gateway、端到端集成 |
| **P2** | 重要功能，应当通过 | Prometheus Exporter、Langfuse |
| **P3** | 辅助功能，建议通过 | OnlyOffice |

## 术语说明

| 术语 | 说明 |
|------|------|
| Admin 用户 | userId 为 `sys` 的用户，角色为 `admin` |
| 普通用户 | 任意非 `sys` 的 userId，角色为 `user` |
| Gateway | 网关服务，默认 `https://localhost:3000`（TLS） |
| Web App | 前端应用，默认 `http://localhost:5173` |
| SECRET_KEY | 网关认证密钥，默认 `test` |

## 测试结果记录格式

| 字段 | 说明 |
|------|------|
| 通过/失败 | 测试是否通过 |
| 实际结果 | 与预期不符时记录实际表现 |
| 备注 | 环境差异、已知问题等 |

---

# 一、Web App 需手工验证的用例

> 以下用例涉及拖拽、剪贴板、视觉渲染、实时轮询等自动化难以覆盖的场景。

## 1.1 聊天功能

### TC-WEB-023 `P1`：重试最后一条消息 ❌ 未自动化

- **前置条件**：已有至少一轮对话
- **操作步骤**：
  1. 找到最后一条 AI 回复
  2. 点击重试按钮
- **预期结果**：
  - AI 重新生成最后一条回复
  - 新回复替换或追加到旧回复

### TC-WEB-024 `P1`：图片上传（拖拽）❌ 未自动化

- **未自动化原因**：Playwright headless 模式下拖拽事件模拟不可靠
- **前置条件**：Agent 配置 vision 模式为 `passthrough` 或 `preprocess`
- **操作步骤**：
  1. 将一张 PNG/JPG 图片拖拽到聊天输入区域
  2. 确认图片预览显示
  3. 输入 `请描述这张图片`
  4. 发送消息
- **预期结果**：
  - 图片以缩略图形式显示在输入区
  - 消息成功发送，AI 对图片进行描述

### TC-WEB-025 `P1`：图片上传（粘贴）❌ 未自动化

- **未自动化原因**：Playwright headless 模式下剪贴板图片粘贴受限
- **前置条件**：同 TC-WEB-024
- **操作步骤**：
  1. 复制一张图片到剪贴板
  2. 在聊天输入框中按 Ctrl+V / Cmd+V
  3. 确认图片预览
  4. 发送消息
- **预期结果**：
  - 图片成功粘贴并显示预览
  - 消息发送成功

### TC-WEB-021 `P1`：SSE 流式响应渲染质量 ⚠️ 建议人工复查

- **自动化状态**：已自动化验证响应完成，但未验证逐字渲染效果
- **操作步骤**：
  1. 在聊天页面发送一条较长的提问
  2. **目视观察** AI 响应过程
- **人工关注点**：
  - 文字是否逐步渲染（非一次性全部显示）
  - 消息区域是否自动滚动跟随
  - 是否有闪烁或布局跳动

### TC-WEB-027 `P1`：切换 Agent ⚠️ 建议人工复查

- **自动化状态**：Agent 切换上下文有隐式测试，但未覆盖会话中切换
- **操作步骤**：
  1. 在聊天页面，已有活跃会话
  2. 在 Agent 选择器中切换到另一个 Agent
- **人工关注点**：
  - 是否创建了新 Session（新的 sessionId）
  - URL 参数是否更新
  - 消息列表是否清空

### TC-WEB-030 `P1`：模型信息显示 ⚠️ 建议人工复查

- **自动化状态**：Agent 卡片的 model info 已测试，但聊天页面输入区域的模型信息未验证
- **操作步骤**：
  1. 在聊天页面观察输入区域
- **人工关注点**：
  - 是否显示当前 Agent 的 provider/model 信息
  - 是否显示 token 状态信息

---

## 1.2 Agent 配置

### TC-WEB-065 `P1`：Prompts Tab — Recipe 创建与编辑 ⚠️ 部分覆盖

- **自动化状态**：Prompt 编辑已测试，但 Recipe 的创建和编辑未覆盖
- **操作步骤**：
  1. 以 `sys` 登录，进入 Agent 配置页，切换到 Prompts Tab
  2. 查看现有 Prompt Recipes 列表
  3. 创建新 Recipe
  4. 编辑已有 Recipe
- **人工关注点**：
  - 列表正确显示已有 Recipes
  - 创建和编辑功能正常
  - 保存后数据持久化

---

## 1.3 定时任务

### TC-WEB-072 `P1`：编辑定时任务 ⚠️ 部分覆盖

- **自动化状态**：创建/删除/暂停/恢复已测试，但「编辑」未覆盖
- **操作步骤**：
  1. 点击任务的「编辑」按钮
  2. 修改 Cron 表达式为 `0 * * * *`
  3. 保存
- **预期结果**：修改成功，列表刷新显示新表达式

### TC-WEB-074 `P1`：立即执行定时任务 ⚠️ 未明确覆盖

- **操作步骤**：
  1. 点击任务的「立即执行」按钮
  2. 等待执行完成
- **预期结果**：
  - 任务立即触发一次执行
  - 在执行历史中可以看到本次执行记录

### TC-WEB-075 `P1`：查看执行历史 ⚠️ 部分覆盖

- **自动化状态**：View Runs 面板打开已测试，但历史详情未验证
- **操作步骤**：
  1. 点击任务的「查看执行记录」按钮
  2. 观察执行历史列表
- **人工关注点**：
  - 每条记录包含：消息数量、Token 数量
  - 可点击跳转到对应聊天会话

### TC-WEB-077 `P1`：草稿持久化 ⚠️ 未自动化

- **操作步骤**：
  1. 在创建定时任务弹窗中填写部分内容但不保存
  2. 关闭弹窗
  3. 刷新页面
  4. 重新打开创建弹窗
- **预期结果**：之前填写的草稿内容被恢复（存储在 localStorage）

---

## 1.4 监控面板

### TC-WEB-083 `P1`：Observability Tab 错误过滤 ❌ 未自动化

- **前置条件**：Langfuse 中有错误 Traces
- **操作步骤**：
  1. 在 Observability Tab 中开启 Error Filter
- **预期结果**：
  - 仅显示有错误的 Traces
  - 错误 Traces 正确标识

### TC-WEB-084 `P1`：Observability Tab 时间范围切换 ⚠️ 部分覆盖

- **自动化状态**：Tab 切换已测试，但时间范围选择器未覆盖
- **操作步骤**：
  1. 分别选择 1h、24h、7d、30d
  2. 观察数据变化
- **预期结果**：每次切换数据正确刷新

---

## 1.5 收件箱

### TC-WEB-093 `P1`：收件箱轮询 ⚠️ 建议人工复查

- **自动化状态**：收件箱基本功能已测试，但 30 秒轮询行为未验证
- **操作步骤**：
  1. 保持 `/inbox` 页面打开
  2. 等待定时任务执行完成（约 30-60 秒）
  3. 观察是否自动出现新通知
- **预期结果**：新通知自动出现（30s 轮询间隔），无需手动刷新

---

## 1.6 国际化

### TC-WEB-100 `P1`：全页面中英文完整性 ⚠️ 建议人工复查

- **自动化状态**：侧边栏语言切换和持久化已测试，但未逐页验证翻译完整性
- **操作步骤**：
  1. 切换到英文，浏览所有页面（首页、聊天、历史、文件、Agent、定时任务、监控、收件箱、设置）
  2. 切换到中文，再次浏览
- **人工关注点**：
  - 是否有遗漏的未翻译文案（硬编码英文/中文）
  - 按钮、标签、placeholder、错误提示是否全部跟随语言

---

# 二、Gateway API 需手工验证的用例

> 以下用例需要通过 curl 直接验证 Gateway API 行为，自动化测试仅通过 UI 间接触达。

## 2.1 认证与 CORS

### TC-GW-003 `P1`：无认证请求被拒绝

```bash
curl -v https://localhost:3000/agents -k
```

- **预期结果**：返回 HTTP 401

### TC-GW-004 `P1`：错误的 Secret Key

```bash
curl -H "x-secret-key: wrong-key" https://localhost:3000/agents -k
```

- **预期结果**：返回 HTTP 401

### TC-GW-095 `P1`：CORS 预检请求 ❌ 未自动化

```bash
curl -X OPTIONS -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: x-secret-key,x-user-id,content-type" \
  -v https://localhost:3000/agents -k
```

- **预期结果**：
  - 返回 HTTP 204
  - 响应头包含 `Access-Control-Allow-Origin`
  - 响应头包含 `Access-Control-Allow-Headers`

---

## 2.2 实例管理

### TC-GW-021 `P1`：sys 实例永不回收 ❌ 未自动化

- **前置条件**：Gateway 运行超过 15 分钟
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: sys" \
    https://localhost:3000/monitoring/instances -k
  ```
- **预期结果**：sys 用户的实例始终存在，状态为 running

### TC-GW-022 `P1`：空闲实例回收 ❌ 未自动化

- **前置条件**：有一个用户实例，且超过 15 分钟无活动
- **操作步骤**：
  1. 创建用户实例（发起一次请求）
  2. 等待超过 15 分钟
  3. 查看实例列表
- **预期结果**：超时后用户实例被自动停止/移除，sys 实例不受影响

---

## 2.3 文件操作

### TC-GW-043 `P1`：文件下载 — Key 参数认证 ⚠️ 部分覆盖

- **自动化状态**：文件下载通过 UI 按钮测试，但 query param 认证方式未验证
- **操作步骤**：
  ```bash
  curl "https://localhost:3000/agents/universal-agent/files/{filepath}?key=test&uid=testuser" -k -o output.txt
  ```
- **预期结果**：通过 query param 认证成功，文件正确下载

### TC-GW-044 `P1`：上传文件大小限制 ❌ 未自动化

- **操作步骤**：
  ```bash
  dd if=/dev/zero of=/tmp/bigfile bs=1M count=55
  curl -X POST -H "x-secret-key: test" -H "x-user-id: testuser" \
    -F "file=@/tmp/bigfile" -F "sessionId={sessionId}" \
    https://localhost:3000/agents/universal-agent/files/upload -k
  ```
- **预期结果**：返回 HTTP 413 或 400，错误信息说明文件超过大小限制

### TC-GW-053 `P1`：Reply Pipeline — Body Limit Hook ❌ 未自动化

- **操作步骤**：构造一个超过 body limit 的请求体（包含超大 base64 图片），发送到 `/reply`
- **预期结果**：返回 HTTP 413

---

## 2.4 Config 与监控 API

### TC-GW-072 `P1`：获取全局配置 ⚠️ 建议人工复查

```bash
curl -H "x-secret-key: test" -H "x-user-id: testuser" \
  https://localhost:3000/config -k
```

- **人工关注点**：
  - 响应包含 `officePreview` 对象
  - `enabled`、`onlyofficeUrl`、`fileBaseUrl` 字段值正确（非空）

---

# 三、Prometheus Exporter 测试用例 `P2` ❌ 全部未自动化

> Prometheus Exporter 的 12 个测试用例完全未被自动化覆盖，全部需要手工验证。

## 3.1 基础端点

### TC-PROM-001 `P2`：Health 端点

```bash
curl http://localhost:9091/health
```

- **预期结果**：返回 HTTP 200，响应体为 `{"status": "ok"}`

### TC-PROM-002 `P2`：首页端点

```bash
curl http://localhost:9091/
```

- **预期结果**：返回 HTML 页面，包含指向 `/metrics` 的链接

### TC-PROM-003 `P2`：Metrics 端点基础

```bash
curl http://localhost:9091/metrics
```

- **预期结果**：返回 Prometheus 文本格式，Content-Type 包含 `text/plain`

---

## 3.2 指标正确性

### TC-PROM-010 `P2`：Gateway 可达性指标

```bash
curl -s http://localhost:9091/metrics | grep opsfactory_gateway_up
```

- **预期结果**：`opsfactory_gateway_up` 值为 `1`

### TC-PROM-011 `P2`：Gateway Uptime 指标

```bash
curl -s http://localhost:9091/metrics | grep opsfactory_gateway_uptime_seconds
```

- **预期结果**：值为正数，多次请求值递增

### TC-PROM-012 `P2`：已配置 Agent 数量

```bash
curl -s http://localhost:9091/metrics | grep opsfactory_agents_configured_total
```

- **预期结果**：值与 `GET /agents` 返回的 Agent 数量一致

### TC-PROM-013 `P2`：实例总数指标

```bash
curl -s http://localhost:9091/metrics | grep opsfactory_instances_total
```

- **预期结果**：按 status 标签分组（starting/running/stopped/error），值与 `/monitoring/instances` 一致

### TC-PROM-014 `P2`：每实例空闲时间指标

```bash
curl -s http://localhost:9091/metrics | grep opsfactory_instance_idle_seconds
```

- **预期结果**：按 `agent_id` 和 `user_id` 标签区分，值为非负数

### TC-PROM-015 `P2`：实例信息指标

```bash
curl -s http://localhost:9091/metrics | grep opsfactory_instance_info
```

- **预期结果**：每个实例一条记录，值为 `1`，标签包含 `agent_id`, `user_id`, `port`, `status`

### TC-PROM-016 `P2`：Langfuse 配置指标

```bash
curl -s http://localhost:9091/metrics | grep opsfactory_langfuse_configured
```

- **预期结果**：值为 `1`（已配置时）

---

## 3.3 异常场景

### TC-PROM-020 `P2`：Gateway 不可达时的降级

1. 停止 Gateway：`./scripts/ctl.sh shutdown gateway`
2. 请求 Exporter：`curl -s http://localhost:9091/metrics | grep opsfactory_gateway_up`
3. 恢复 Gateway 后重新请求

- **预期结果**：
  - 停止时 `opsfactory_gateway_up` 值为 `0`，Exporter 不崩溃
  - 恢复后值恢复为 `1`

### TC-PROM-021 `P2`：Node.js 进程指标

```bash
curl -s http://localhost:9091/metrics | grep "opsfactory_exporter_"
```

- **预期结果**：包含 Node.js 默认指标（CPU、内存、GC 等）

---

# 四、Langfuse 测试用例 `P2` ❌ 几乎全部未自动化

> 16 个用例中仅 1 个有自动化覆盖（TC-LF-030），其余全部需手工验证。

## 4.1 服务部署

### TC-LF-001 `P2`：Langfuse 服务启动

```bash
cd langfuse && docker compose up -d
docker compose ps
```

- **预期结果**：`langfuse` 和 `postgres` 容器正常运行

### TC-LF-002 `P2`：Langfuse Web UI 可访问

- 浏览器访问 `http://localhost:3100`
- **预期结果**：登录页面加载，可用 `admin@opsfactory.local` / `opsfactory` 登录

### TC-LF-003 `P2`：Langfuse API 健康检查

```bash
curl http://localhost:3100/api/public/health
```

- **预期结果**：返回 HTTP 200

### TC-LF-004 `P2`：Postgres 连通性

```bash
docker exec langfuse-postgres pg_isready
```

- **预期结果**：返回 accepting connections

### TC-LF-005 `P2`：预配置项目和密钥

- 登录 Langfuse Web UI，检查项目列表
- **预期结果**：存在项目 `ops-factory-agents`，Public Key 为 `pk-lf-opsfactory`

---

## 4.2 数据采集

### TC-LF-010 `P2`：goosed 自动上报 Traces

1. 通过 Web App 或 API 发起一轮对话
2. 等待 10-30 秒
3. 登录 Langfuse Web UI → Traces 页面

- **预期结果**：出现新的 Trace 记录

### TC-LF-011 `P2`：Trace 包含 Token 计数

- 在 Langfuse 中打开 Trace，查看 Observations
- **预期结果**：包含 `input_tokens` 和 `output_tokens`，值为正数

### TC-LF-012 `P2`：Trace 包含延迟信息

- **预期结果**：Trace 有 `latency` 字段，值合理（数百毫秒到数秒）

### TC-LF-013 `P2`：Trace 包含成本信息

- **预期结果**：显示 cost 信息（取决于模型是否支持成本计算）

---

## 4.3 Gateway 集成

### TC-LF-020 `P2`：Overview API 数据一致性

```bash
curl -H "x-secret-key: test" -H "x-user-id: sys" \
  "https://localhost:3000/monitoring/overview?from=2026-03-01&to=2026-03-17" -k
```

- 对比 Langfuse Web UI 中同时间段数据
- **预期结果**：totalTraces、成本、延迟等数据基本一致

### TC-LF-021 `P2`：Traces API 数据一致性

```bash
curl -H "x-secret-key: test" -H "x-user-id: sys" \
  "https://localhost:3000/monitoring/traces?from=2026-03-01&to=2026-03-17&limit=5" -k
```

- **预期结果**：返回的 Trace ID、时间戳等与 Langfuse UI 一致

### TC-LF-022 `P2`：Observations API 数据

```bash
curl -H "x-secret-key: test" -H "x-user-id: sys" \
  "https://localhost:3000/monitoring/observations?from=2026-03-01&to=2026-03-17" -k
```

- **预期结果**：返回按 observation 名称分组的延迟分布

### TC-LF-023 `P2`：Langfuse 未配置时的降级

- 移除或清空 Langfuse 配置后调用监控接口
- **预期结果**：返回 `configured: false`，不导致 Gateway 崩溃

### TC-LF-031 `P2`：直达 Langfuse 链接

- 在监控页面 Traces 表格中点击直达链接
- **预期结果**：在新标签页中打开 Langfuse 对应 Trace 详情页

---

# 五、OnlyOffice 测试用例 `P3` ❌ 全部未自动化

> OnlyOffice 涉及 Docker 容器、iframe 渲染、跨容器网络，全部 13 个用例需手工验证。

## 5.1 服务部署

### TC-OO-001 `P3`：OnlyOffice 容器启动

```bash
cd onlyoffice && ./scripts/ctl.sh startup
docker ps | grep onlyoffice
```

- **预期结果**：容器正常运行，端口 8080 被占用

### TC-OO-002 `P3`：OnlyOffice API 可达

```bash
curl -s http://localhost:8080/healthcheck
```

- **预期结果**：返回 `true`

### TC-OO-003 `P3`：OnlyOffice API JS 可加载

```bash
curl -s -o /dev/null -w "%{http_code}" \
  http://localhost:8080/web-apps/apps/api/documents/api.js
```

- **预期结果**：返回 HTTP 200

---

## 5.2 Gateway 集成

### TC-OO-010 `P3`：Config 接口返回 OnlyOffice 配置

```bash
curl -H "x-secret-key: test" -H "x-user-id: testuser" \
  https://localhost:3000/config -k
```

- **预期结果**：
  - `officePreview.enabled` 为 `true`
  - `onlyofficeUrl` 为 `http://127.0.0.1:8080`（非空）
  - `fileBaseUrl` 为 `https://host.docker.internal:3000`（非空）

### TC-OO-012 `P3`：fileBaseUrl 可达性

```bash
docker exec <onlyoffice-container-id> \
  curl -sk https://host.docker.internal:3000/status
```

- **预期结果**：返回 `"ok"`，OnlyOffice 容器可以通过 `fileBaseUrl` 访问 Gateway

---

## 5.3 文件预览功能

### TC-OO-020 `P3`：DOCX 文件预览

1. 在 Web App `/files` 页面找到 `.docx` 文件
2. 点击预览按钮

- **预期结果**：
  - OnlyOffice DocEditor 渲染 Word 文档
  - 内容正确显示（文字、格式、图片）
  - 查看模式（不可编辑），允许下载和打印

### TC-OO-021 `P3`：XLSX 文件预览

- 预览 `.xlsx` 文件
- **预期结果**：表格数据、公式结果、单元格格式正确显示

### TC-OO-022 `P3`：PPTX 文件预览

- 预览 `.pptx` 文件
- **预期结果**：幻灯片内容正确显示

### TC-OO-023 `P3`：旧版 Office 格式预览（.doc/.xls/.ppt）

- 依次预览 .doc、.xls、.ppt 文件
- **预期结果**：均能通过 OnlyOffice 正确渲染，无格式错乱

### TC-OO-024 `P3`：预览语言跟随 i18n 设置

1. Web App 设为中文，打开 Office 文件预览
2. 切换为英文，重新打开预览

- **预期结果**：OnlyOffice 编辑器的 UI 语言跟随 Web App 语言设置

### TC-OO-025 `P3`：关闭预览时编辑器销毁

1. 打开 .docx 预览
2. 关闭预览面板
3. 打开浏览器开发者工具 → 控制台

- **预期结果**：`destroyEditor()` 被调用，无 JavaScript 错误，无残留 DOM 元素

### TC-OO-026 `P3`：OnlyOffice 不可用时的降级

1. 停止 OnlyOffice 容器
2. 尝试预览 .docx 文件

- **预期结果**：
  - 显示错误提示和下载链接（非空白页面）
  - 非 Office 文件（.md, .png 等）预览不受影响

---

# 六、端到端集成场景

> 以下集成场景涉及多服务协调、长时间运行、多用户并发，自动化仅部分覆盖。

## 6.1 完整用户流程

### TC-E2E-002 `P1`：管理员完整管理流程 ⚠️ 部分覆盖

- **自动化状态**：各子功能独立测试通过，但未在单一流程中串联验证
- **操作步骤**：
  1. 以 `sys` 登录
  2. 创建新 Agent `e2e-test-agent`
  3. 配置 AGENTS.md
  4. 添加 MCP 扩展
  5. 创建 Cron 任务并立即执行
  6. 检查收件箱通知
  7. 检查监控面板
  8. 检查 Observability Tab
  9. 清理：删除定时任务、删除 Agent

### TC-E2E-003 `P1`：多用户并发 ⚠️ 部分覆盖

- **自动化状态**：多用户隔离有隐式测试，但非真正并发
- **操作步骤**：
  1. 浏览器 A 以 `user1` 登录
  2. 浏览器 B 以 `user2` 登录
  3. 两个用户同时向 `universal-agent` 发送消息
  4. 以 `sys` 查看监控 → 实例列表
- **人工关注点**：
  - 对话互不干扰
  - 消息内容不会串到另一个用户
  - 实例列表显示两个独立实例

---

## 6.2 服务编排 ❌ 全部未自动化

### TC-E2E-010 `P1`：全服务启动

```bash
./scripts/ctl.sh startup
./scripts/ctl.sh status
```

- **预期结果**：所有服务（Gateway、Web App、OnlyOffice、Langfuse、Exporter）正常启动

### TC-E2E-011 `P1`：全服务停止

```bash
./scripts/ctl.sh shutdown all
```

- **预期结果**：所有服务停止，端口释放，无残留进程

### TC-E2E-012 `P1`：单服务重启

```bash
./scripts/ctl.sh restart gateway
```

- **预期结果**：仅 Gateway 重启，其他服务不受影响

### TC-E2E-013 `P1`：服务状态检查

```bash
./scripts/ctl.sh status
```

- **预期结果**：正确显示每个服务的运行状态和端口信息

---

## 6.3 Prometheus + Gateway 联动 ⚠️ 部分覆盖

### TC-E2E-020 `P1`：创建实例后指标更新

1. 记录当前 `opsfactory_instances_total` 值
2. 以新用户发起对话
3. 重新请求 `/metrics`

- **预期结果**：`opsfactory_instances_total{status="running"}` 增加

### TC-E2E-021 `P1`：Agent CRUD 后指标更新

1. 记录 `opsfactory_agents_configured_total`
2. 创建新 Agent → 请求 `/metrics` → 值 +1
3. 删除 Agent → 请求 `/metrics` → 值恢复

---

# 附录

## A. 覆盖率统计

| 模块 | 总用例 | 本文档需手工验证 | 自动化已覆盖 |
|------|--------|-----------------|-------------|
| Web App | 42 | 14 | 28 |
| Gateway API | 28 | 9 | 19 |
| Prometheus | 12 | 12 | 0 |
| Langfuse | 16 | 14 | 2 |
| OnlyOffice | 13 | 13 | 0 |
| E2E 集成 | 9 | 7 | 2 |
| **合计** | **120** | **69** | **51** |

## B. 测试数据准备清单

| 数据 | 说明 | 准备方式 |
|------|------|----------|
| 测试图片 | PNG/JPG，< 5MB | 准备 1-2 张测试图片 |
| 测试文件 | .txt, .md, .csv | 准备若干小型文本文件 |
| Office 文件 | .docx, .xlsx, .pptx | 准备各一个包含基本内容的文件 |
| 旧版 Office | .doc, .xls, .ppt | 准备各一个用于兼容性测试 |
| 大文件 | > 50MB | 用 `dd` 命令生成用于限制测试 |

## C. 常用调试命令

```bash
# 查看 Gateway 日志
tail -f gateway/logs/gateway.log

# 查看运行中的 Docker 容器
docker ps

# 查看端口占用
lsof -i :3000   # Gateway
lsof -i :5173   # Web App
lsof -i :8080   # OnlyOffice
lsof -i :3100   # Langfuse
lsof -i :9091   # Exporter

# 检查 goosed 进程
ps aux | grep goosed

# Gateway 快速健康检查
curl -sk https://localhost:3000/status

# 全量指标拉取
curl -s http://localhost:9091/metrics
```

## D. 自动化测试运行方式

```bash
cd test
npm install
npm run test:e2e              # 全量运行（需所有服务启动）
npm run test:e2e:headed       # 带浏览器界面运行
npx playwright test --grep "TC-WEB-020"  # 按关键词筛选
```

> 自动化测试报告：`test/report/e2e-test-report.md`
