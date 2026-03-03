# Web App 使用 Mock Gateway 指南

本文档说明如何在没有真实 gateway 和 goosed 的情况下，让 `web-app` 连接到仓库内置的 `mock-gateway`。

目标很简单：

- `web-app` 不改代码
- 只切换 gateway 地址
- 首页、聊天、历史、文件、MCP、Prompt、调度等页面可以用假数据跑起来

## 1. 适用场景

这个方案适合以下用途：

- 前端页面开发
- UI 联调
- 本地演示
- 自动化测试

这个方案不适合以下用途：

- 验证真实 gateway 行为
- 验证真实 goosed 进程管理
- 验证真实文件系统、副作用工具或外部集成

## 2. Mock Gateway 提供了什么

`mock-gateway` 是一个独立 HTTP 服务，接口形状尽量兼容当前 `web-app` 使用的 gateway 契约。

当前覆盖的能力包括：

- `GET /status`
- `GET /me`
- `GET /config`
- `GET /agents`
- `GET /monitoring/*`
- `GET /agents/:id/system_info`
- `POST /agents/:id/agent/start`
- `POST /agents/:id/agent/resume`
- `POST /agents/:id/reply`
- `GET /agents/:id/sessions`
- `GET /agents/:id/sessions/:sessionId`
- `DELETE /agents/:id/sessions/:sessionId`
- `PUT /agents/:id/sessions/:sessionId/name`
- `GET /agents/:id/sessions/:sessionId/export`
- `GET/PUT /agents/:id/config`
- `GET/POST/DELETE /agents/:id/mcp`
- `GET /agents/:id/skills`
- `GET /agents/:id/files`
- `GET /agents/:id/files/:path`
- `POST /agents/:id/files/upload`
- `GET/PUT/DELETE /agents/:id/config/prompts/*`
- `GET/POST/PUT/DELETE /agents/:id/schedule/*`

限制也要明确：

- 所有数据都在内存里，服务重启后会丢失
- 聊天回复是固定合成文本，不会调用真实模型
- 上传文件只保存 mock 记录，不会落盘
- 不会启动 goosed，也不会代理真实 agent

## 3. 启动 Mock Gateway

在仓库根目录执行：

```bash
cd /Users/buyangnie/Documents/GitHub/ops-factory/gateway-mock
GATEWAY_HOST=127.0.0.1 GATEWAY_PORT=3100 GATEWAY_SECRET_KEY=test npm run dev
```

看到类似输出说明启动成功：

```text
mock gateway listening on http://127.0.0.1:3100
```

说明：

- `GATEWAY_PORT` 可以换成任意空闲端口
- `GATEWAY_SECRET_KEY` 必须和 `web-app` 使用的密钥一致
- 如果你不显式设置 `GATEWAY_SECRET_KEY`，默认值是 `test`

## 4. 配置 Web App 指向 Mock Gateway

这个仓库里 `web-app` 的 Vite 配置读取的是：

- `GATEWAY_URL`
- `GATEWAY_SECRET_KEY`

然后再映射成前端代码里使用的 `VITE_GATEWAY_URL` 和 `VITE_GATEWAY_SECRET_KEY`。

所以本地开发时，直接在 `web-app/.env` 或 `web-app/.env.local` 里写下面内容即可：

```bash
GATEWAY_URL=http://127.0.0.1:3100
GATEWAY_SECRET_KEY=test
```

如果你把 mock gateway 启在别的端口，`GATEWAY_URL` 要同步改掉。

## 5. 启动 Web App

在另一个终端执行：

```bash
cd /Users/buyangnie/Documents/GitHub/ops-factory/web-app
npm run dev -- --host 127.0.0.1
```

默认地址：

```text
http://127.0.0.1:5173
```

## 6. 验证是否切换成功

建议按下面顺序验证。

### 6.1 验证 mock gateway 本身

```bash
curl -s http://127.0.0.1:3100/status -H 'x-secret-key: test'
```

预期输出：

```text
ok
```

### 6.2 验证 web-app 已连接到 mock gateway

打开：

```text
http://127.0.0.1:5173
```

建议手工检查这些页面：

- 首页能看到 agent 列表
- 首页发起一条对话后能进入 chat
- chat 页面能看到 mock 回复
- history 页面能看到刚才的会话
- files 页面能看到 mock 文件
- scheduler 页面可以创建和运行 mock 调度任务

## 7. 常见操作

### 7.1 切回真实 gateway

只要把 `web-app/.env` 或 `web-app/.env.local` 改回真实地址：

```bash
GATEWAY_URL=http://127.0.0.1:3000
GATEWAY_SECRET_KEY=test
```

然后重启 `web-app` 即可。

### 7.2 清空 mock 数据

`mock-gateway` 的状态都在内存里，最简单的方式就是重启服务。

### 7.3 改 mock 返回内容

主要修改文件：

- [gateway-mock/src/index.ts](/Users/buyangnie/Documents/GitHub/ops-factory/gateway-mock/src/index.ts)

几个常用位置：

- agent 静态数据：`agentCatalog`
- 文件种子数据：`seedFiles()`
- prompt 种子数据：`promptsByAgent`
- MCP 种子数据：`mcpByAgent`
- 聊天回复模板：`makeAssistantReply()`

## 8. 自动化测试

mock gateway 的契约测试统一放在 `test/` 目录下。

执行方式：

```bash
cd /Users/buyangnie/Documents/GitHub/ops-factory/test
npx vitest run --config vitest.config.ts mock-gateway.test.ts
```

这组测试会验证：

- 基础启动接口
- SDK 会话与流式聊天
- 配置、文件、MCP、Prompt、调度等 web-app 依赖接口

## 9. 当前实现文件

- 文档：[/Users/buyangnie/Documents/GitHub/ops-factory/docs/webapp-with-mock-gateway.md](/Users/buyangnie/Documents/GitHub/ops-factory/docs/webapp-with-mock-gateway.md)
- 服务：[/Users/buyangnie/Documents/GitHub/ops-factory/gateway-mock/src/index.ts](/Users/buyangnie/Documents/GitHub/ops-factory/gateway-mock/src/index.ts)
- 启动脚本：[/Users/buyangnie/Documents/GitHub/ops-factory/gateway-mock/package.json](/Users/buyangnie/Documents/GitHub/ops-factory/gateway-mock/package.json)
- 测试：[/Users/buyangnie/Documents/GitHub/ops-factory/test/mock-gateway.test.ts](/Users/buyangnie/Documents/GitHub/ops-factory/test/mock-gateway.test.ts)
