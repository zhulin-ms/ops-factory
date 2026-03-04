# Ops Factory 手工验证测试用例

> **版本**：v1.0
> **更新日期**：2026-03-04
> **适用范围**：Web App、Gateway、Prometheus Exporter、Langfuse、OnlyOffice
> **测试环境要求**：所有服务通过 `./scripts/ctl.sh startup` 正常启动

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
| Gateway | 网关服务，默认 `http://localhost:3000` |
| Web App | 前端应用，默认 `http://localhost:5173` |
| SECRET_KEY | 网关认证密钥，默认 `test` |

## 测试结果记录格式

| 字段 | 说明 |
|------|------|
| 通过/失败 | 测试是否通过 |
| 实际结果 | 与预期不符时记录实际表现 |
| 备注 | 环境差异、已知问题等 |

---

# 一、Web App 测试用例 `P1`

## 1.1 登录与权限

### TC-WEB-001 `P1`：普通用户登录

- **前置条件**：Web App 和 Gateway 已启动
- **操作步骤**：
  1. 打开 `http://localhost:5173`
  2. 在登录页输入用户名 `testuser`
  3. 点击登录按钮
- **预期结果**：
  - 跳转到首页 `/`
  - 左侧导航栏显示，不包含「定时任务」「监控」等管理员菜单
  - localStorage 中存储了 `userId=testuser`

### TC-WEB-002 `P1`：管理员用户登录

- **前置条件**：Web App 和 Gateway 已启动
- **操作步骤**：
  1. 打开 `http://localhost:5173`
  2. 在登录页输入用户名 `sys`
  3. 点击登录按钮
- **预期结果**：
  - 跳转到首页 `/`
  - 左侧导航栏包含全部菜单项，包括「定时任务」「监控」
  - 通过 `GET /me` 接口确认 role 为 `admin`

### TC-WEB-003 `P1`：未登录访问受保护页面

- **前置条件**：未登录或已清除 localStorage
- **操作步骤**：
  1. 清除浏览器 localStorage
  2. 直接访问 `http://localhost:5173/chat`
- **预期结果**：
  - 自动重定向到 `/login` 页面

### TC-WEB-004 `P1`：普通用户访问管理员页面

- **前置条件**：以普通用户身份登录
- **操作步骤**：
  1. 以 `testuser` 登录
  2. 直接在地址栏输入 `http://localhost:5173/scheduled-actions`
  3. 再尝试 `http://localhost:5173/monitoring`
- **预期结果**：
  - 两个页面均重定向到首页 `/`
  - 不显示管理员内容

### TC-WEB-005 `P1`：用户登出

- **前置条件**：已登录
- **操作步骤**：
  1. 点击侧边栏中的登出按钮/选项
  2. 观察页面跳转
- **预期结果**：
  - 跳转到 `/login`
  - localStorage 中 `userId` 被清除
  - 再次访问任意受保护页面均重定向到登录页

---

## 1.2 首页

### TC-WEB-010 `P1`：首页加载与展示

- **前置条件**：已登录
- **操作步骤**：
  1. 访问首页 `/`
  2. 观察页面布局
- **预期结果**：
  - 显示聊天输入框和 Agent 选择器
  - 显示 Prompt 模板卡片
  - 模板按 Agent 分类（Tab 切换：universal-agent、kb-agent、all）

### TC-WEB-011 `P1`：Prompt 模板切换 Agent Tab

- **前置条件**：已登录，首页已加载
- **操作步骤**：
  1. 点击 `universal-agent` Tab
  2. 观察模板列表
  3. 切换到 `kb-agent` Tab
  4. 切换到 `all` Tab
- **预期结果**：
  - 每个 Tab 显示对应 Agent 的模板
  - `all` Tab 显示所有模板

### TC-WEB-012 `P1`：点击 Prompt 模板快速开始

- **前置条件**：已登录，首页已加载
- **操作步骤**：
  1. 点击任意一个 Prompt 模板卡片
  2. 观察聊天输入框
  3. 点击发送
- **预期结果**：
  - 输入框自动填充模板内容
  - 发送后跳转到 `/chat` 页面
  - 自动创建新 Session 并开始对话

### TC-WEB-013 `P1`：首页直接输入发送

- **前置条件**：已登录
- **操作步骤**：
  1. 在首页聊天输入框中输入 `你好`
  2. 选择一个 Agent
  3. 点击发送
- **预期结果**：
  - 跳转到 `/chat` 页面
  - 创建新 Session
  - AI 开始流式响应

---

## 1.3 聊天功能

### TC-WEB-020 `P1`：创建新会话并发送消息

- **前置条件**：已登录
- **操作步骤**：
  1. 导航到 `/chat`（不带 sessionId 参数）
  2. 确认 Agent 选择器显示默认 Agent
  3. 输入消息 `请简单介绍一下你自己`
  4. 点击发送
- **预期结果**：
  - URL 更新为带有 `sessionId` 和 `agent` 参数
  - 用户消息显示在消息列表
  - AI 响应以流式方式逐步显示
  - 响应完成后输入框恢复可用

### TC-WEB-021 `P1`：SSE 流式响应显示

- **前置条件**：已有活跃会话
- **操作步骤**：
  1. 在聊天页面发送一条较长的提问
  2. 观察 AI 响应过程
- **预期结果**：
  - 文字逐步渲染，不是一次性全部显示
  - 消息区域自动滚动跟随
  - 响应过程中显示加载/生成状态指示

### TC-WEB-022 `P1`：停止生成

- **前置条件**：AI 正在生成响应
- **操作步骤**：
  1. 发送一条会产生较长回复的消息
  2. 在 AI 响应过程中点击停止按钮
- **预期结果**：
  - 生成立即停止
  - 已生成的内容保留显示
  - 输入框恢复可用

### TC-WEB-023 `P1`：重试最后一条消息

- **前置条件**：已有至少一轮对话
- **操作步骤**：
  1. 找到最后一条 AI 回复
  2. 点击重试按钮
- **预期结果**：
  - AI 重新生成最后一条回复
  - 新回复替换或追加到旧回复

### TC-WEB-024 `P1`：图片上传（拖拽）

- **前置条件**：Agent 配置 vision 模式为 `passthrough` 或 `preprocess`
- **操作步骤**：
  1. 将一张 PNG/JPG 图片拖拽到聊天输入区域
  2. 确认图片预览显示
  3. 输入 `请描述这张图片`
  4. 发送消息
- **预期结果**：
  - 图片以缩略图形式显示在输入区
  - 消息成功发送，AI 对图片进行描述

### TC-WEB-025 `P1`：图片上传（粘贴）

- **前置条件**：同 TC-WEB-024
- **操作步骤**：
  1. 复制一张图片到剪贴板
  2. 在聊天输入框中按 Ctrl+V / Cmd+V
  3. 确认图片预览
  4. 发送消息
- **预期结果**：
  - 图片成功粘贴并显示预览
  - 消息发送成功

### TC-WEB-026 `P1`：文件附件上传

- **前置条件**：已登录，在聊天页面
- **操作步骤**：
  1. 点击文件附件按钮
  2. 选择一个文本文件（如 .txt 或 .md）
  3. 输入 `请总结这个文件的内容`
  4. 发送消息
- **预期结果**：
  - 文件上传成功，显示在输入区
  - AI 能够读取并回应文件内容

### TC-WEB-027 `P1`：切换 Agent

- **前置条件**：已在聊天页面，有活跃会话
- **操作步骤**：
  1. 在 Agent 选择器中切换到另一个 Agent
  2. 观察页面变化
- **预期结果**：
  - 创建新 Session（新的 sessionId）
  - URL 参数更新为新 Agent
  - 消息列表清空（新会话）

### TC-WEB-028 `P1`：恢复已有会话

- **前置条件**：至少有一个历史会话
- **操作步骤**：
  1. 记录一个已有会话的 sessionId
  2. 导航到 `/chat?sessionId={id}&agent={agentId}`
- **预期结果**：
  - 加载历史消息
  - 可以继续对话
  - Agent 自动识别正确

### TC-WEB-029 `P1`：工具调用显示

- **前置条件**：使用的 Agent 有可用的工具扩展
- **操作步骤**：
  1. 发送一个会触发工具调用的消息（如 `帮我搜索今天的新闻`）
  2. 观察消息区域
- **预期结果**：
  - 工具调用以可折叠/展开的方式显示
  - 显示工具名称和执行状态
  - 最终结果正常呈现

### TC-WEB-030 `P1`：模型信息显示

- **前置条件**：已在聊天页面
- **操作步骤**：
  1. 观察输入区域的模型信息
- **预期结果**：
  - 显示当前 Agent 使用的 provider/model 信息
  - 显示 token 状态信息

---

## 1.4 历史记录

### TC-WEB-040 `P1`：查看历史会话列表

- **前置条件**：已有多个会话（跨不同 Agent）
- **操作步骤**：
  1. 导航到 `/history`
  2. 观察会话列表
- **预期结果**：
  - 显示所有会话，按时间倒序排列
  - 每条记录显示会话标题/摘要、Agent 信息、时间
  - 跨 Agent 的会话均出现

### TC-WEB-041 `P1`：从历史打开会话

- **前置条件**：历史列表中有会话
- **操作步骤**：
  1. 在历史列表中点击一个会话
- **预期结果**：
  - 跳转到 `/chat` 页面
  - 正确加载该会话的历史消息
  - 可以继续对话

---

## 1.5 文件浏览

### TC-WEB-050 `P1`：文件列表展示

- **前置条件**：至少有一个 Agent 产生过输出文件
- **操作步骤**：
  1. 导航到 `/files`
  2. 观察文件列表
- **预期结果**：
  - 聚合显示所有 Agent 的输出文件
  - 默认显示 "All" 分类

### TC-WEB-051 `P1`：文件分类筛选

- **前置条件**：有多种类型的文件
- **操作步骤**：
  1. 依次点击分类 Tab：Doc、Sheet、Slide、Markdown、HTML、Others
  2. 观察每个 Tab 下的文件列表
- **预期结果**：
  - Doc Tab 显示 `.docx`/`.doc` 文件
  - Sheet Tab 显示 `.xlsx`/`.csv` 文件
  - Slide Tab 显示 `.pptx` 文件
  - Markdown Tab 显示 `.md` 文件
  - HTML Tab 显示 `.html` 文件
  - Others Tab 显示其余类型文件

### TC-WEB-052 `P1`：文件搜索

- **前置条件**：文件列表有多个文件
- **操作步骤**：
  1. 在搜索框输入文件名关键词
  2. 观察筛选结果
  3. 搜索 Agent 名称
  4. 搜索文件类型
- **预期结果**：
  - 按名称、Agent、类型均可正确过滤
  - 清空搜索恢复全部文件

### TC-WEB-053 `P1`：文件预览

- **前置条件**：文件列表中有可预览的文件
- **操作步骤**：
  1. 点击一个 `.md` 文件的预览按钮
  2. 观察侧边预览面板
  3. 关闭预览
  4. 点击一个图片文件的预览
  5. 点击一个代码文件的预览
- **预期结果**：
  - Markdown 文件以渲染后的格式显示
  - 图片文件显示图片
  - 代码文件显示语法高亮
  - 预览面板可正常关闭

### TC-WEB-054 `P1`：文件下载

- **前置条件**：文件列表中有文件
- **操作步骤**：
  1. 点击文件的下载按钮
- **预期结果**：
  - 浏览器触发下载
  - 下载的文件名和内容正确

---

## 1.6 Agent 管理

### TC-WEB-060 `P1`：Agent 列表展示

- **前置条件**：以管理员身份登录
- **操作步骤**：
  1. 导航到 `/agents`
  2. 观察 Agent 卡片列表
- **预期结果**：
  - 显示所有已配置的 Agent 卡片
  - 每张卡片显示：名称、状态、模型、Skill 数量、MCP 数量
  - 包含「创建 Agent」按钮

### TC-WEB-061 `P1`：创建新 Agent（管理员）

- **前置条件**：以 `sys` 用户登录
- **操作步骤**：
  1. 点击「创建 Agent」按钮
  2. 在弹窗中输入 Agent 名称，如 `test-agent`
  3. 确认创建
- **预期结果**：
  - Agent 创建成功
  - 新 Agent 出现在列表中
  - 自动生成 ID（基于名称）

### TC-WEB-062 `P1`：删除 Agent（管理员）

- **前置条件**：以 `sys` 登录，有一个可删除的测试 Agent
- **操作步骤**：
  1. 在 Agent 卡片上找到删除按钮
  2. 点击删除
  3. 在确认弹窗中确认
- **预期结果**：
  - Agent 从列表中移除
  - 对应的实例被停止
  - 再次访问该 Agent 返回 404

### TC-WEB-063 `P1`：普通用户无法创建/删除 Agent

- **前置条件**：以普通用户登录
- **操作步骤**：
  1. 导航到 `/agents`
  2. 观察页面
- **预期结果**：
  - 不显示「创建 Agent」按钮
  - 不显示删除按钮
  - Agent 卡片上无「Configure」入口（或入口不可见）

### TC-WEB-064 `P1`：Agent 配置页面 — Overview Tab

- **前置条件**：以 `sys` 登录
- **操作步骤**：
  1. 进入 `/agents/universal-agent/configure`
  2. 查看 Overview Tab
  3. 修改 AGENTS.md 内容
  4. 点击保存
  5. 刷新页面确认保存生效
- **预期结果**：
  - 显示 AGENTS.md（系统提示词）的编辑器
  - 修改并保存后内容持久化
  - 刷新后显示修改后的内容

### TC-WEB-065 `P1`：Agent 配置页面 — Prompts Tab

- **前置条件**：以 `sys` 登录，在 Agent 配置页
- **操作步骤**：
  1. 切换到 Prompts Tab
  2. 查看现有 Prompt Recipes 列表
  3. 创建新 Recipe
  4. 编辑已有 Recipe
- **预期结果**：
  - 列表正确显示已有 Recipes
  - 创建和编辑功能正常
  - 保存后数据持久化

### TC-WEB-066 `P1`：Agent 配置页面 — MCP Tab

- **前置条件**：以 `sys` 登录，在 Agent 配置页
- **操作步骤**：
  1. 切换到 MCP Tab
  2. 查看现有 MCP 扩展列表
  3. 点击添加 MCP，填入扩展信息
  4. 保存
  5. 删除刚添加的 MCP
- **预期结果**：
  - MCP 列表正确展示
  - 添加弹窗正常工作
  - 新增和删除操作成功
  - 变更 Fan-out 到所有用户实例

### TC-WEB-067 `P1`：Agent 配置页面 — Skills Tab

- **前置条件**：以 `sys` 登录，在 Agent 配置页
- **操作步骤**：
  1. 切换到 Skills Tab
  2. 查看 Skill 列表
- **预期结果**：
  - 显示该 Agent 下 `skills/` 目录中的所有 Skill
  - 每个 Skill 显示名称和描述

---

## 1.7 定时任务（管理员）

### TC-WEB-070 `P1`：查看定时任务列表

- **前置条件**：以 `sys` 登录
- **操作步骤**：
  1. 导航到 `/scheduled-actions`
  2. 选择一个 Agent
- **预期结果**：
  - 显示该 Agent 下的 Cron 任务列表
  - 每个任务显示：名称、Cron 表达式、状态

### TC-WEB-071 `P1`：创建定时任务

- **前置条件**：以 `sys` 登录，在定时任务页面
- **操作步骤**：
  1. 点击「创建」按钮
  2. 填写任务名称：`测试定时任务`
  3. 填写指令（Instruction）：`请输出当前时间`
  4. 填写 Cron 表达式：`*/5 * * * *`（每5分钟）
  5. 保存
- **预期结果**：
  - 任务创建成功，出现在列表中
  - 显示正确的 Cron 表达式

### TC-WEB-072 `P1`：编辑定时任务

- **前置条件**：已有定时任务
- **操作步骤**：
  1. 点击任务的「编辑」按钮
  2. 修改 Cron 表达式为 `0 * * * *`
  3. 保存
- **预期结果**：
  - 修改成功，列表刷新显示新表达式

### TC-WEB-073 `P1`：暂停与恢复定时任务

- **前置条件**：已有运行中的定时任务
- **操作步骤**：
  1. 点击任务的「暂停」按钮
  2. 确认状态变为已暂停
  3. 点击「恢复」按钮
  4. 确认状态恢复为运行中
- **预期结果**：
  - 暂停/恢复操作立即生效
  - 状态正确显示

### TC-WEB-074 `P1`：立即执行定时任务

- **前置条件**：已有定时任务
- **操作步骤**：
  1. 点击任务的「立即执行」按钮
  2. 等待执行完成
- **预期结果**：
  - 任务立即触发一次执行
  - 在执行历史中可以看到本次执行记录

### TC-WEB-075 `P1`：查看执行历史

- **前置条件**：定时任务至少执行过一次
- **操作步骤**：
  1. 点击任务的「查看执行记录」按钮
  2. 观察执行历史列表
- **预期结果**：
  - 显示历次执行记录
  - 每条记录包含：消息数量、Token 数量
  - 可点击跳转到对应聊天会话

### TC-WEB-076 `P1`：删除定时任务

- **前置条件**：已有定时任务
- **操作步骤**：
  1. 点击任务的「删除」按钮
  2. 确认删除
- **预期结果**：
  - 任务从列表中移除
  - 不再触发后续执行

### TC-WEB-077 `P1`：草稿持久化

- **前置条件**：在创建定时任务弹窗中
- **操作步骤**：
  1. 填写部分内容但不保存
  2. 关闭弹窗
  3. 刷新页面
  4. 重新打开创建弹窗
- **预期结果**：
  - 之前填写的草稿内容被恢复（存储在 localStorage）

---

## 1.8 监控面板（管理员）

### TC-WEB-080 `P1`：Platform Tab

- **前置条件**：以 `sys` 登录
- **操作步骤**：
  1. 导航到 `/monitoring`
  2. 查看 Platform Tab
- **预期结果**：
  - 显示 Gateway 运行状态（uptime、host:port）
  - 显示已配置 Agent 数量
  - 显示 Langfuse 配置状态
  - 显示空闲超时设置
  - 显示运行中的实例表格（Agent、User、Port、状态、空闲时间）

### TC-WEB-081 `P1`：Agents Tab

- **前置条件**：以 `sys` 登录
- **操作步骤**：
  1. 切换到 Agents Tab
- **预期结果**：
  - 显示所有 Agent 的表格
  - 每行包含：Agent 名称、Provider、Model、实例数量、状态

### TC-WEB-082 `P1`：Observability Tab（Langfuse 已配置）

- **前置条件**：Langfuse 已启动并配置
- **操作步骤**：
  1. 切换到 Observability Tab
  2. 选择时间范围（1h/24h/7d/30d）
  3. 观察数据展示
- **预期结果**：
  - KPI 卡片显示：总 Traces 数、总成本、平均延迟、P95 延迟、Observations 数、错误数
  - 趋势图展示每日变化
  - Observation 表格显示按名称分组的延迟数据
  - 最近 Traces 表格可展开查看详情
  - 每个 Trace 有直达 Langfuse 的链接

### TC-WEB-083 `P1`：Observability Tab 错误过滤

- **前置条件**：Langfuse 中有错误 Traces
- **操作步骤**：
  1. 在 Observability Tab 中开启 Error Filter
- **预期结果**：
  - 仅显示有错误的 Traces
  - 错误 Traces 正确标识

### TC-WEB-084 `P1`：Observability Tab 时间范围切换

- **前置条件**：有不同时间范围的 Langfuse 数据
- **操作步骤**：
  1. 分别选择 1h、24h、7d、30d
  2. 观察数据变化
- **预期结果**：
  - 每次切换数据正确刷新
  - KPI、图表、表格均反映选定时间范围的数据

---

## 1.9 收件箱

### TC-WEB-090 `P1`：收件箱通知展示

- **前置条件**：有定时任务产生的会话通知
- **操作步骤**：
  1. 导航到 `/inbox`
  2. 观察通知列表
- **预期结果**：
  - 通知按 Agent 分组
  - 每条通知显示会话信息
  - 侧边栏显示未读数量 Badge

### TC-WEB-091 `P1`：打开通知对应会话

- **前置条件**：收件箱有通知
- **操作步骤**：
  1. 点击一条通知
  2. 选择「打开会话」
- **预期结果**：
  - 跳转到 `/chat` 页面
  - 正确加载该会话

### TC-WEB-092 `P1`：标记为已读/全部已读

- **前置条件**：收件箱有多条未读通知
- **操作步骤**：
  1. 点击某条通知的「标记已读」
  2. 确认该条变为已读
  3. 点击「全部标记已读」按钮
  4. 确认所有通知变为已读
- **预期结果**：
  - 单条/全部标记已读功能正常
  - 侧边栏 Badge 数字正确更新
  - 刷新页面后已读状态保持

### TC-WEB-093 `P1`：收件箱轮询

- **前置条件**：有定时任务即将执行
- **操作步骤**：
  1. 保持 `/inbox` 页面打开
  2. 等待定时任务执行完成（约 30-60 秒）
  3. 观察是否自动出现新通知
- **预期结果**：
  - 新通知自动出现（30s 轮询间隔）
  - 无需手动刷新页面

---

## 1.10 国际化

### TC-WEB-100 `P1`：中英文切换

- **前置条件**：已登录
- **操作步骤**：
  1. 找到语言切换按钮/选项
  2. 切换到英文
  3. 浏览各主要页面
  4. 切换回中文
  5. 再次浏览各主要页面
- **预期结果**：
  - 所有 UI 文案正确切换
  - 导航栏、按钮、标签、提示信息均跟随语言变化
  - 无遗漏的未翻译文案

---

# 二、Gateway 测试用例 `P1`

## 2.1 健康检查与认证

### TC-GW-001 `P1`：健康检查接口

- **前置条件**：Gateway 已启动
- **操作步骤**：
  ```bash
  curl http://localhost:3000/status
  ```
- **预期结果**：
  - 返回 HTTP 200
  - 响应体为 `"ok"`

### TC-GW-002 `P1`：正确认证

- **前置条件**：Gateway 已启动
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: sys" http://localhost:3000/me
  ```
- **预期结果**：
  - 返回 HTTP 200
  - 响应体包含 `{"userId": "sys", "role": "admin"}`

### TC-GW-003 `P1`：无认证请求被拒绝

- **前置条件**：Gateway 已启动
- **操作步骤**：
  ```bash
  curl -v http://localhost:3000/agents
  ```
- **预期结果**：
  - 返回 HTTP 401
  - 响应体包含未认证错误信息

### TC-GW-004 `P1`：错误的 Secret Key

- **前置条件**：Gateway 已启动
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: wrong-key" http://localhost:3000/agents
  ```
- **预期结果**：
  - 返回 HTTP 401

### TC-GW-005 `P1`：普通用户角色验证

- **前置条件**：Gateway 已启动
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: testuser" http://localhost:3000/me
  ```
- **预期结果**：
  - 返回 `{"userId": "testuser", "role": "user"}`

### TC-GW-006 `P1`：RBAC — 普通用户访问管理员接口

- **前置条件**：Gateway 已启动
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: testuser" \
    http://localhost:3000/monitoring/system
  ```
- **预期结果**：
  - 返回 HTTP 403
  - 响应体包含权限不足错误信息

---

## 2.2 Agent CRUD

### TC-GW-010 `P1`：获取 Agent 列表

- **前置条件**：Gateway 已启动
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: sys" \
    http://localhost:3000/agents
  ```
- **预期结果**：
  - 返回 HTTP 200
  - JSON 数组包含已配置的 Agent（universal-agent, kb-agent, report-agent）
  - 每个 Agent 包含 id、name 等基本信息

### TC-GW-011 `P1`：创建 Agent

- **前置条件**：以 admin 身份调用
- **操作步骤**：
  ```bash
  curl -X POST -H "x-secret-key: test" -H "x-user-id: sys" \
    -H "Content-Type: application/json" \
    -d '{"name": "test-agent"}' \
    http://localhost:3000/agents
  ```
- **预期结果**：
  - 返回 HTTP 200/201
  - 新 Agent 出现在列表中
  - `gateway/agents/test-agent/` 目录被创建
  - 配置从 `universal-agent` 模板复制

### TC-GW-012 `P1`：删除 Agent

- **前置条件**：有一个测试 Agent
- **操作步骤**：
  ```bash
  curl -X DELETE -H "x-secret-key: test" -H "x-user-id: sys" \
    http://localhost:3000/agents/test-agent
  ```
- **预期结果**：
  - 返回 HTTP 200
  - Agent 从列表中移除
  - 对应的 goosed 实例被停止
  - `gateway/agents/test-agent/` 目录被清理

### TC-GW-013 `P1`：普通用户不能创建 Agent

- **前置条件**：Gateway 已启动
- **操作步骤**：
  ```bash
  curl -X POST -H "x-secret-key: test" -H "x-user-id: testuser" \
    -H "Content-Type: application/json" \
    -d '{"name": "hack-agent"}' \
    http://localhost:3000/agents
  ```
- **预期结果**：
  - 返回 HTTP 403

---

## 2.3 实例管理

### TC-GW-020 `P1`：按需启动实例

- **前置条件**：Gateway 刚启动，无用户实例
- **操作步骤**：
  1. 查看当前实例：
     ```bash
     curl -H "x-secret-key: test" -H "x-user-id: sys" \
       http://localhost:3000/monitoring/instances
     ```
  2. 发起一个用户请求触发实例创建：
     ```bash
     curl -X POST -H "x-secret-key: test" -H "x-user-id: newuser" \
       -H "Content-Type: application/json" \
       http://localhost:3000/agents/universal-agent/agent/start
     ```
  3. 再次查看实例列表
- **预期结果**：
  - 步骤 1：只有 sys 用户的实例
  - 步骤 2：请求成功，实例被创建
  - 步骤 3：出现 `newuser` 的实例，且该用户其他 Agent 的实例也被预热

### TC-GW-021 `P1`：sys 实例永不回收

- **前置条件**：Gateway 运行超过 15 分钟
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: sys" \
    http://localhost:3000/monitoring/instances
  ```
- **预期结果**：
  - sys 用户的实例始终存在
  - 状态为 running

### TC-GW-022 `P1`：空闲实例回收

- **前置条件**：有一个用户实例，且超过 15 分钟无活动
- **操作步骤**：
  1. 创建用户实例（发起一次请求）
  2. 等待超过 15 分钟（或将 `IDLE_TIMEOUT_MS` 配置为较短时间进行测试）
  3. 查看实例列表
- **预期结果**：
  - 超时后用户实例被自动停止/移除
  - sys 实例不受影响

---

## 2.4 会话管理

### TC-GW-030 `P1`：创建会话

- **前置条件**：Gateway 已启动
- **操作步骤**：
  ```bash
  curl -X POST -H "x-secret-key: test" -H "x-user-id: testuser" \
    -H "Content-Type: application/json" \
    http://localhost:3000/agents/universal-agent/agent/start
  ```
- **预期结果**：
  - 返回 HTTP 200
  - 响应包含新的 sessionId

### TC-GW-031 `P1`：获取聚合会话列表

- **前置条件**：testuser 在多个 Agent 下有会话
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: testuser" \
    http://localhost:3000/sessions
  ```
- **预期结果**：
  - 返回所有 Agent 下该用户的会话
  - 会话来自 user 实例和 sys 实例

### TC-GW-032 `P1`：获取单个会话

- **前置条件**：已有一个 sessionId
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: testuser" \
    http://localhost:3000/sessions/{sessionId}
  ```
- **预期结果**：
  - 返回该会话的详细信息
  - 包含消息历史

### TC-GW-033 `P1`：删除会话

- **前置条件**：已有一个 sessionId
- **操作步骤**：
  ```bash
  curl -X DELETE -H "x-secret-key: test" -H "x-user-id: testuser" \
    http://localhost:3000/sessions/{sessionId}
  ```
- **预期结果**：
  - 返回 HTTP 200
  - 会话被删除
  - 关联的上传文件被清理

### TC-GW-034 `P1`：获取特定 Agent 的会话列表

- **前置条件**：testuser 在 universal-agent 下有会话
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: testuser" \
    http://localhost:3000/agents/universal-agent/sessions
  ```
- **预期结果**：
  - 仅返回 universal-agent 下的会话

---

## 2.5 文件操作

### TC-GW-040 `P1`：文件上传

- **前置条件**：Gateway 已启动，已有一个 sessionId
- **操作步骤**：
  ```bash
  curl -X POST -H "x-secret-key: test" -H "x-user-id: testuser" \
    -F "file=@/path/to/test.txt" \
    -F "sessionId={sessionId}" \
    http://localhost:3000/agents/universal-agent/files/upload
  ```
- **预期结果**：
  - 返回 HTTP 200
  - 文件存储在 `uploads/{sessionId}/` 目录下

### TC-GW-041 `P1`：文件列表

- **前置条件**：Agent 有输出文件
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: testuser" \
    http://localhost:3000/agents/universal-agent/files
  ```
- **预期结果**：
  - 返回文件列表 JSON
  - 包含文件名、路径、大小等信息

### TC-GW-042 `P1`：文件下载

- **前置条件**：有可用文件
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: testuser" \
    http://localhost:3000/agents/universal-agent/files/{filepath} -o output.txt
  ```
- **预期结果**：
  - 文件正确下载
  - Content-Disposition 头正确设置

### TC-GW-043 `P1`：文件下载 — Key 参数认证

- **前置条件**：有可用文件
- **操作步骤**：
  ```bash
  curl "http://localhost:3000/agents/universal-agent/files/{filepath}?key=test&userId=testuser" \
    -o output.txt
  ```
- **预期结果**：
  - 通过 query param 认证成功
  - 文件正确下载

### TC-GW-044 `P1`：上传文件大小限制

- **前置条件**：Gateway 已启动（默认 MAX_UPLOAD_FILE_SIZE_MB=10）
- **操作步骤**：
  1. 创建一个 15MB 的测试文件
  2. 尝试上传
     ```bash
     dd if=/dev/zero of=/tmp/bigfile bs=1M count=15
     curl -X POST -H "x-secret-key: test" -H "x-user-id: testuser" \
       -F "file=@/tmp/bigfile" \
       -F "sessionId={sessionId}" \
       http://localhost:3000/agents/universal-agent/files/upload
     ```
- **预期结果**：
  - 返回 HTTP 413 或 400
  - 错误信息说明文件超过大小限制

---

## 2.6 SSE 流式代理

### TC-GW-050 `P1`：发送消息并获取流式响应

- **前置条件**：已有活跃 Session
- **操作步骤**：
  ```bash
  curl -N -X POST -H "x-secret-key: test" -H "x-user-id: testuser" \
    -H "Content-Type: application/json" \
    -d '{"session_id": "{sessionId}", "messages": [{"role": "user", "content": [{"type": "text", "text": "你好"}]}]}' \
    http://localhost:3000/agents/universal-agent/agent/reply
  ```
- **预期结果**：
  - 返回 SSE 流（`Content-Type: text/event-stream`）
  - 数据逐步输出
  - 流正常结束

### TC-GW-051 `P1`：停止生成

- **前置条件**：正在进行流式响应
- **操作步骤**：
  ```bash
  curl -X POST -H "x-secret-key: test" -H "x-user-id: testuser" \
    http://localhost:3000/agents/universal-agent/agent/stop
  ```
- **预期结果**：
  - 生成被中断
  - 返回成功状态

### TC-GW-052 `P1`：恢复会话

- **前置条件**：已有暂停的 Session
- **操作步骤**：
  ```bash
  curl -N -X POST -H "x-secret-key: test" -H "x-user-id: testuser" \
    -H "Content-Type: application/json" \
    -d '{"session_id": "{sessionId}"}' \
    http://localhost:3000/agents/universal-agent/agent/resume
  ```
- **预期结果**：
  - 会话恢复，返回 SSE 流

### TC-GW-053 `P1`：Reply Pipeline — Body Limit Hook

- **前置条件**：Gateway 已启动
- **操作步骤**：
  1. 构造一个超过 body limit 的请求体（包含超大 base64 图片）
  2. 发送到 `/reply`
- **预期结果**：
  - 返回 HTTP 413
  - 错误信息说明请求体超过限制

---

## 2.7 MCP 管理

### TC-GW-060 `P1`：获取 MCP 列表

- **前置条件**：以 admin 身份调用
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: sys" \
    http://localhost:3000/agents/universal-agent/mcp
  ```
- **预期结果**：
  - 返回当前 Agent 的 MCP 扩展列表

### TC-GW-061 `P1`：添加 MCP 扩展

- **前置条件**：以 admin 身份调用
- **操作步骤**：
  ```bash
  curl -X POST -H "x-secret-key: test" -H "x-user-id: sys" \
    -H "Content-Type: application/json" \
    -d '{"name": "test-mcp", "type": "stdio", "cmd": "echo", "args": ["hello"]}' \
    http://localhost:3000/agents/universal-agent/mcp
  ```
- **预期结果**：
  - MCP 扩展添加成功
  - Fan-out 到所有用户实例

### TC-GW-062 `P1`：删除 MCP 扩展

- **前置条件**：有可删除的 MCP 扩展
- **操作步骤**：
  ```bash
  curl -X DELETE -H "x-secret-key: test" -H "x-user-id: sys" \
    http://localhost:3000/agents/universal-agent/mcp/test-mcp
  ```
- **预期结果**：
  - MCP 扩展被删除
  - Fan-out 到所有用户实例

---

## 2.8 Config 管理

### TC-GW-070 `P1`：获取 Agent 配置（AGENTS.md）

- **前置条件**：以 admin 身份调用
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: sys" \
    http://localhost:3000/agents/universal-agent/config
  ```
- **预期结果**：
  - 返回 AGENTS.md 的内容

### TC-GW-071 `P1`：更新 Agent 配置

- **前置条件**：以 admin 身份调用
- **操作步骤**：
  ```bash
  curl -X PUT -H "x-secret-key: test" -H "x-user-id: sys" \
    -H "Content-Type: application/json" \
    -d '{"content": "# Updated Agent\nNew system prompt."}' \
    http://localhost:3000/agents/universal-agent/config
  ```
- **预期结果**：
  - 配置更新成功
  - 再次 GET 返回更新后的内容

### TC-GW-072 `P1`：获取全局配置

- **前置条件**：Gateway 已启动
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: testuser" \
    http://localhost:3000/config
  ```
- **预期结果**：
  - 返回包含 `officePreview` 的配置信息
  - 包含 `enabled`、`onlyofficeUrl` 等字段

---

## 2.9 监控 API

### TC-GW-080 `P1`：系统监控

- **前置条件**：以 admin 身份调用
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: sys" \
    http://localhost:3000/monitoring/system
  ```
- **预期结果**：
  - 返回 JSON 包含：gateway 健康状态、uptime、Agent 列表、Langfuse 状态

### TC-GW-081 `P1`：实例监控

- **前置条件**：以 admin 身份调用
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: sys" \
    http://localhost:3000/monitoring/instances
  ```
- **预期结果**：
  - 返回所有运行中的 goosed 实例
  - 按 Agent 分组
  - 每个实例包含：agent_id, user_id, port, status, idle_time

### TC-GW-082 `P1`：Langfuse 监控状态

- **前置条件**：以 admin 身份调用
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: sys" \
    http://localhost:3000/monitoring/status
  ```
- **预期结果**：
  - 返回 Langfuse 是否配置、是否可达

### TC-GW-083 `P1`：Langfuse Overview 数据

- **前置条件**：Langfuse 已配置且有数据
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: sys" \
    "http://localhost:3000/monitoring/overview?from=2026-03-01&to=2026-03-04"
  ```
- **预期结果**：
  - 返回 KPI 数据：totalTraces, totalCost, avgLatency, P95, errorCount
  - 包含 dailyTrend 数组

### TC-GW-084 `P1`：Langfuse Traces 查询

- **前置条件**：Langfuse 已配置且有 Trace 数据
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: sys" \
    "http://localhost:3000/monitoring/traces?from=2026-03-01&to=2026-03-04&limit=10"
  ```
- **预期结果**：
  - 返回最近的 Trace 列表
  - 每条 Trace 包含 ID、时间、延迟等信息

### TC-GW-085 `P1`：Langfuse Observations 查询

- **前置条件**：Langfuse 已配置
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: sys" \
    "http://localhost:3000/monitoring/observations?from=2026-03-01&to=2026-03-04"
  ```
- **预期结果**：
  - 返回延迟分布数据
  - 按 observation 名称分组

---

## 2.10 Skills

### TC-GW-090 `P1`：获取 Skill 列表

- **前置条件**：以 admin 身份调用
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: sys" \
    http://localhost:3000/agents/universal-agent/skills
  ```
- **预期结果**：
  - 返回 Skill 列表
  - 每个 Skill 包含名称和描述

---

## 2.11 CORS

### TC-GW-095 `P1`：CORS 预检请求

- **前置条件**：Gateway 已启动
- **操作步骤**：
  ```bash
  curl -X OPTIONS -H "Origin: http://localhost:5173" \
    -H "Access-Control-Request-Method: POST" \
    -H "Access-Control-Request-Headers: x-secret-key,x-user-id,content-type" \
    -v http://localhost:3000/agents
  ```
- **预期结果**：
  - 返回 HTTP 204
  - 响应头包含 `Access-Control-Allow-Origin`
  - 响应头包含 `Access-Control-Allow-Headers` 列出允许的头

---

# 三、Prometheus Exporter 测试用例 `P2`

## 3.1 基础端点

### TC-PROM-001 `P2`：Health 端点

- **前置条件**：Exporter 已启动（默认端口 9091）
- **操作步骤**：
  ```bash
  curl http://localhost:9091/health
  ```
- **预期结果**：
  - 返回 HTTP 200
  - 响应体为 `{"status": "ok"}`

### TC-PROM-002 `P2`：首页端点

- **前置条件**：Exporter 已启动
- **操作步骤**：
  ```bash
  curl http://localhost:9091/
  ```
- **预期结果**：
  - 返回 HTML 页面
  - 包含指向 `/metrics` 的链接

### TC-PROM-003 `P2`：Metrics 端点基础

- **前置条件**：Exporter 和 Gateway 均已启动
- **操作步骤**：
  ```bash
  curl http://localhost:9091/metrics
  ```
- **预期结果**：
  - 返回 Prometheus 文本格式
  - Content-Type 包含 `text/plain` 或 `text/plain; version=0.0.4`

---

## 3.2 指标正确性

### TC-PROM-010 `P2`：Gateway 可达性指标

- **前置条件**：Gateway 正常运行
- **操作步骤**：
  ```bash
  curl -s http://localhost:9091/metrics | grep opsfactory_gateway_up
  ```
- **预期结果**：
  - `opsfactory_gateway_up` 值为 `1`

### TC-PROM-011 `P2`：Gateway Uptime 指标

- **前置条件**：Gateway 已运行一段时间
- **操作步骤**：
  ```bash
  curl -s http://localhost:9091/metrics | grep opsfactory_gateway_uptime_seconds
  ```
- **预期结果**：
  - `opsfactory_gateway_uptime_seconds` 为正数
  - 多次请求值递增

### TC-PROM-012 `P2`：已配置 Agent 数量

- **前置条件**：Gateway 已配置若干 Agent
- **操作步骤**：
  ```bash
  curl -s http://localhost:9091/metrics | grep opsfactory_agents_configured_total
  ```
- **预期结果**：
  - 值与 `GET /agents` 返回的 Agent 数量一致（如 3）

### TC-PROM-013 `P2`：实例总数指标

- **前置条件**：有运行中的实例
- **操作步骤**：
  ```bash
  curl -s http://localhost:9091/metrics | grep opsfactory_instances_total
  ```
- **预期结果**：
  - 按 status 标签分组（starting/running/stopped/error）
  - 值与 `/monitoring/instances` 返回的一致

### TC-PROM-014 `P2`：每实例空闲时间指标

- **前置条件**：有运行中的实例
- **操作步骤**：
  ```bash
  curl -s http://localhost:9091/metrics | grep opsfactory_instance_idle_seconds
  ```
- **预期结果**：
  - 按 `agent_id` 和 `user_id` 标签区分
  - 值为非负数

### TC-PROM-015 `P2`：实例信息指标

- **前置条件**：有运行中的实例
- **操作步骤**：
  ```bash
  curl -s http://localhost:9091/metrics | grep opsfactory_instance_info
  ```
- **预期结果**：
  - 每个实例一条记录，值为 `1`
  - 标签包含 `agent_id`, `user_id`, `port`, `status`

### TC-PROM-016 `P2`：Langfuse 配置指标

- **前置条件**：Langfuse 已配置
- **操作步骤**：
  ```bash
  curl -s http://localhost:9091/metrics | grep opsfactory_langfuse_configured
  ```
- **预期结果**：
  - 值为 `1`

---

## 3.3 异常场景

### TC-PROM-020 `P2`：Gateway 不可达时的降级

- **前置条件**：Exporter 已启动，Gateway 已停止
- **操作步骤**：
  1. 停止 Gateway：`./scripts/ctl.sh shutdown gateway`
  2. 请求 Exporter：
     ```bash
     curl -s http://localhost:9091/metrics | grep opsfactory_gateway_up
     ```
- **预期结果**：
  - `opsfactory_gateway_up` 值为 `0`
  - Exporter 不崩溃，其他默认指标仍然返回
  - 恢复 Gateway 后，重新请求 `/metrics`，`gateway_up` 恢复为 `1`

### TC-PROM-021 `P2`：Node.js 进程指标

- **前置条件**：Exporter 已启动
- **操作步骤**：
  ```bash
  curl -s http://localhost:9091/metrics | grep "opsfactory_exporter_"
  ```
- **预期结果**：
  - 包含 Node.js 默认指标（CPU、内存、GC 等）

---

# 四、Langfuse 测试用例 `P2`

## 4.1 服务部署

### TC-LF-001 `P2`：Langfuse 服务启动

- **前置条件**：Docker 已安装
- **操作步骤**：
  ```bash
  cd langfuse && docker compose up -d
  ```
- **预期结果**：
  - `langfuse` 和 `postgres` 容器正常运行
  - `docker compose ps` 显示两个服务状态为 running

### TC-LF-002 `P2`：Langfuse Web UI 可访问

- **前置条件**：Langfuse 已启动
- **操作步骤**：
  1. 浏览器访问 `http://localhost:3100`
- **预期结果**：
  - Langfuse 登录页面正常加载
  - 可使用 `admin@opsfactory.local` / `opsfactory` 登录

### TC-LF-003 `P2`：Langfuse API 健康检查

- **前置条件**：Langfuse 已启动
- **操作步骤**：
  ```bash
  curl http://localhost:3100/api/public/health
  ```
- **预期结果**：
  - 返回 HTTP 200
  - 表示服务健康

### TC-LF-004 `P2`：Postgres 连通性

- **前置条件**：Langfuse 已启动
- **操作步骤**：
  ```bash
  docker exec langfuse-postgres pg_isready
  ```
- **预期结果**：
  - 返回 accepting connections

### TC-LF-005 `P2`：预配置项目和密钥

- **前置条件**：Langfuse 首次启动完成
- **操作步骤**：
  1. 登录 Langfuse Web UI
  2. 检查项目列表
- **预期结果**：
  - 存在项目 `ops-factory-agents`
  - Public Key 为 `pk-lf-opsfactory`
  - 组织为 `ops-factory`

---

## 4.2 数据采集

### TC-LF-010 `P2`：goosed 自动上报 Traces

- **前置条件**：Langfuse 和 Gateway 均已启动，Agent 配置了 Langfuse 参数
- **操作步骤**：
  1. 通过 Web App 或 API 发起一轮对话
  2. 等待 10-30 秒（Langfuse 数据异步上报）
  3. 登录 Langfuse Web UI → Traces 页面
- **预期结果**：
  - 出现新的 Trace 记录
  - Trace 包含正确的 project（ops-factory-agents）

### TC-LF-011 `P2`：Trace 包含 Token 计数

- **前置条件**：TC-LF-010 已完成
- **操作步骤**：
  1. 在 Langfuse 中打开刚创建的 Trace
  2. 查看 Observations
- **预期结果**：
  - Observation 包含 `input_tokens` 和 `output_tokens`
  - Token 数量为正数

### TC-LF-012 `P2`：Trace 包含延迟信息

- **前置条件**：TC-LF-010 已完成
- **操作步骤**：
  1. 在 Langfuse 中查看 Trace 详情
- **预期结果**：
  - Trace 有 `latency` 字段
  - 值合理（通常数百毫秒到数秒）

### TC-LF-013 `P2`：Trace 包含成本信息

- **前置条件**：Langfuse 中有 Trace 数据
- **操作步骤**：
  1. 在 Langfuse 中查看 Trace 详情
- **预期结果**：
  - 显示 cost 信息（取决于模型是否支持成本计算）

---

## 4.3 Gateway 集成

### TC-LF-020 `P2`：Overview API 数据一致性

- **前置条件**：Langfuse 中有数据，Gateway 已启动
- **操作步骤**：
  1. 通过 Gateway API 获取 overview：
     ```bash
     curl -H "x-secret-key: test" -H "x-user-id: sys" \
       "http://localhost:3000/monitoring/overview?from=2026-03-01&to=2026-03-04"
     ```
  2. 在 Langfuse Web UI 中对比同时间段的数据
- **预期结果**：
  - Gateway 返回的 totalTraces 数量与 Langfuse UI 中的一致
  - 成本、延迟等数据基本一致

### TC-LF-021 `P2`：Traces API 数据一致性

- **前置条件**：同上
- **操作步骤**：
  1. 通过 Gateway API 获取 traces：
     ```bash
     curl -H "x-secret-key: test" -H "x-user-id: sys" \
       "http://localhost:3000/monitoring/traces?from=2026-03-01&to=2026-03-04&limit=5"
     ```
  2. 在 Langfuse Web UI 中对比
- **预期结果**：
  - 返回的 Trace ID、时间戳等与 Langfuse UI 一致

### TC-LF-022 `P2`：Observations API 数据

- **前置条件**：同上
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: sys" \
    "http://localhost:3000/monitoring/observations?from=2026-03-01&to=2026-03-04"
  ```
- **预期结果**：
  - 返回按 observation 名称分组的延迟分布
  - 包含 avgLatency 和 P95 延迟

### TC-LF-023 `P2`：Langfuse 未配置时的降级

- **前置条件**：移除或清空 Langfuse 配置
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: sys" \
    http://localhost:3000/monitoring/status
  ```
- **预期结果**：
  - 返回 `configured: false`
  - 访问 overview/traces/observations 接口返回适当的错误或空数据
  - 不导致 Gateway 崩溃

---

## 4.4 Web 面板联动

### TC-LF-030 `P2`：监控页面 Langfuse 数据展示

- **前置条件**：以 sys 登录，Langfuse 已配置并有数据
- **操作步骤**：
  1. 导航到 `/monitoring`
  2. 切换到 Observability Tab
- **预期结果**：
  - KPI 卡片数据与 Langfuse API 返回的一致
  - 趋势图正确渲染
  - Traces 表格有数据

### TC-LF-031 `P2`：直达 Langfuse 链接

- **前置条件**：监控页面 Traces 表格有数据
- **操作步骤**：
  1. 在 Traces 表格中找到一条记录
  2. 点击其直达 Langfuse 的链接
- **预期结果**：
  - 在新标签页中打开 Langfuse
  - 直接定位到对应的 Trace 详情页

---

# 五、OnlyOffice 测试用例 `P3`

## 5.1 服务部署

### TC-OO-001 `P3`：OnlyOffice 容器启动

- **前置条件**：Docker 已安装
- **操作步骤**：
  ```bash
  cd onlyoffice && ./scripts/ctl.sh startup
  ```
- **预期结果**：
  - Docker 容器 `onlyoffice/documentserver` 正常运行
  - 端口 8080 被占用

### TC-OO-002 `P3`：OnlyOffice API 可达

- **前置条件**：OnlyOffice 已启动
- **操作步骤**：
  ```bash
  curl -s http://localhost:8080/healthcheck
  ```
- **预期结果**：
  - 返回 `true` 或 HTTP 200

### TC-OO-003 `P3`：OnlyOffice API JS 可加载

- **前置条件**：OnlyOffice 已启动
- **操作步骤**：
  ```bash
  curl -s -o /dev/null -w "%{http_code}" \
    http://localhost:8080/web-apps/apps/api/documents/api.js
  ```
- **预期结果**：
  - 返回 HTTP 200
  - 内容为 JavaScript 代码

---

## 5.2 Gateway 集成

### TC-OO-010 `P3`：Config 接口返回 OnlyOffice 配置

- **前置条件**：Gateway 配置了 OnlyOffice
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: testuser" \
    http://localhost:3000/config
  ```
- **预期结果**：
  - 响应包含 `officePreview` 对象
  - `enabled` 为 `true`
  - `onlyofficeUrl` 为 `http://localhost:8080`

### TC-OO-011 `P3`：OnlyOffice 未启用时的配置

- **前置条件**：`OFFICE_PREVIEW_ENABLED=false` 或未配置
- **操作步骤**：
  ```bash
  curl -H "x-secret-key: test" -H "x-user-id: testuser" \
    http://localhost:3000/config
  ```
- **预期结果**：
  - `officePreview.enabled` 为 `false`
  - 前端不应尝试加载 OnlyOffice

### TC-OO-012 `P3`：fileBaseUrl 可达性

- **前置条件**：OnlyOffice 容器运行中
- **操作步骤**：
  1. 确认 `fileBaseUrl`（通常为 `http://host.docker.internal:3000`）
  2. 从 OnlyOffice 容器内验证可达性：
     ```bash
     docker exec <onlyoffice-container-id> \
       curl -s http://host.docker.internal:3000/status
     ```
- **预期结果**：
  - 返回 `"ok"`
  - OnlyOffice 容器可以访问 Gateway 获取文件

---

## 5.3 文件预览功能

### TC-OO-020 `P3`：DOCX 文件预览

- **前置条件**：有一个 .docx 文件在 Agent 输出目录中，OnlyOffice 已启动
- **操作步骤**：
  1. 在 Web App 文件浏览页面找到 .docx 文件
  2. 点击预览按钮
- **预期结果**：
  - 侧边预览面板打开
  - 使用 OnlyOffice DocEditor 渲染 Word 文档
  - 文档内容正确显示（文字、格式、图片等）
  - 模式为「查看模式」（不可编辑）
  - 允许下载和打印

### TC-OO-021 `P3`：XLSX 文件预览

- **前置条件**：有一个 .xlsx 文件
- **操作步骤**：
  1. 在文件浏览页面找到 .xlsx 文件
  2. 点击预览按钮
- **预期结果**：
  - 使用 OnlyOffice Spreadsheet Editor 渲染
  - 表格数据、公式结果、单元格格式正确显示
  - 查看模式

### TC-OO-022 `P3`：PPTX 文件预览

- **前置条件**：有一个 .pptx 文件
- **操作步骤**：
  1. 在文件浏览页面找到 .pptx 文件
  2. 点击预览按钮
- **预期结果**：
  - 使用 OnlyOffice Presentation Editor 渲染
  - 幻灯片内容正确显示
  - 查看模式

### TC-OO-023 `P3`：旧版 Office 格式预览（.doc/.xls/.ppt）

- **前置条件**：有旧版格式的 Office 文件
- **操作步骤**：
  1. 依次预览 .doc、.xls、.ppt 文件
- **预期结果**：
  - 均能通过 OnlyOffice 正确渲染
  - 无格式错乱

### TC-OO-024 `P3`：预览语言跟随 i18n 设置

- **前置条件**：OnlyOffice 预览可用
- **操作步骤**：
  1. 将 Web App 语言设为中文
  2. 打开一个 Office 文件预览
  3. 观察 OnlyOffice 编辑器界面语言
  4. 将 Web App 语言切换为英文
  5. 重新打开预览
- **预期结果**：
  - OnlyOffice 编辑器的 UI 语言跟随 Web App 语言设置

### TC-OO-025 `P3`：关闭预览时编辑器销毁

- **前置条件**：已打开 Office 文件预览
- **操作步骤**：
  1. 打开一个 .docx 预览
  2. 关闭预览面板
  3. 打开浏览器开发者工具 → 控制台
  4. 检查是否有内存泄漏或错误
- **预期结果**：
  - 预览关闭时 `destroyEditor()` 被调用
  - 无 JavaScript 错误
  - 无残留 DOM 元素

### TC-OO-026 `P3`：OnlyOffice 不可用时的降级

- **前置条件**：停止 OnlyOffice 容器
- **操作步骤**：
  1. 停止 OnlyOffice：`docker stop <container>`
  2. 在 Web App 中尝试预览 .docx 文件
- **预期结果**：
  - 不使用 OnlyOffice 预览（降级到其他方式或显示下载提示）
  - 不出现空白页面或 JavaScript 错误
  - 非 Office 文件（.md, .png 等）预览不受影响

---

# 六、端到端集成场景 `P1`

## 6.1 完整用户流程

### TC-E2E-001 `P1`：新用户完整体验流程

- **前置条件**：所有服务已启动
- **操作步骤**：
  1. 打开 Web App，输入用户名 `e2euser` 登录
  2. 在首页选择 `universal-agent`，使用 Prompt 模板开始对话
  3. 在聊天中发送几轮对话
  4. 上传一张图片，发送相关提问
  5. 导航到「历史记录」，确认会话出现
  6. 导航到「文件浏览」，查看是否有产出文件
  7. 如有文件，预览并下载一个
  8. 登出，重新登录
  9. 确认历史会话仍然存在
- **预期结果**：
  - 全流程无错误
  - 数据正确持久化
  - 用户体验流畅

### TC-E2E-002 `P1`：管理员完整管理流程

- **前置条件**：所有服务已启动
- **操作步骤**：
  1. 以 `sys` 登录
  2. 进入 Agent 管理，创建新 Agent `e2e-test-agent`
  3. 配置新 Agent 的 AGENTS.md
  4. 添加一个 MCP 扩展
  5. 进入定时任务，为新 Agent 创建一个 Cron 任务
  6. 立即执行该定时任务
  7. 检查收件箱是否收到执行通知
  8. 进入监控面板，确认新 Agent 和实例出现
  9. 检查 Observability Tab 是否有新 Trace
  10. 删除定时任务
  11. 删除 Agent
- **预期结果**：
  - 全流程无错误
  - 创建和删除操作正确执行
  - 监控数据正确反映变化

### TC-E2E-003 `P1`：多用户并发

- **前置条件**：所有服务已启动
- **操作步骤**：
  1. 在浏览器 A 以 `user1` 登录
  2. 在浏览器 B（或无痕窗口）以 `user2` 登录
  3. 两个用户同时向 `universal-agent` 发送消息
  4. 以 `sys` 登录第三个浏览器，查看监控 → 实例列表
- **预期结果**：
  - 两个用户的对话互不干扰
  - 各自有独立的 Session
  - 实例列表显示两个用户的独立实例
  - 消息内容不会串到另一个用户

---

## 6.2 服务编排

### TC-E2E-010 `P1`：全服务启动

- **前置条件**：无服务在运行
- **操作步骤**：
  ```bash
  ./scripts/ctl.sh startup
  ```
- **预期结果**：
  - OnlyOffice 容器启动（如启用）
  - Langfuse 容器启动（如启用）
  - Gateway 进程启动
  - Prometheus Exporter 启动（如启用）
  - Web App Vite dev server 启动
  - `./scripts/ctl.sh status` 显示所有服务 running

### TC-E2E-011 `P1`：全服务停止

- **前置条件**：所有服务在运行
- **操作步骤**：
  ```bash
  ./scripts/ctl.sh shutdown all
  ```
- **预期结果**：
  - 所有服务正常停止
  - 端口释放
  - Docker 容器停止
  - 无残留进程

### TC-E2E-012 `P1`：单服务重启

- **前置条件**：所有服务在运行
- **操作步骤**：
  ```bash
  ./scripts/ctl.sh restart gateway
  ```
- **预期结果**：
  - 仅 Gateway 重启
  - 其他服务不受影响
  - Web App 短暂断联后自动恢复
  - sys 实例重新创建

### TC-E2E-013 `P1`：服务状态检查

- **前置条件**：部分或全部服务在运行
- **操作步骤**：
  ```bash
  ./scripts/ctl.sh status
  ```
- **预期结果**：
  - 正确显示每个服务的运行状态
  - 显示端口信息
  - 已停止的服务标记为 stopped

---

## 6.3 Prometheus + Gateway 联动

### TC-E2E-020 `P1`：创建实例后指标更新

- **前置条件**：Exporter 和 Gateway 均已启动
- **操作步骤**：
  1. 记录当前 `opsfactory_instances_total` 的值
  2. 以新用户发起对话（触发实例创建）
  3. 等待几秒后重新请求 `/metrics`
- **预期结果**：
  - `opsfactory_instances_total{status="running"}` 增加
  - 新实例出现在 `opsfactory_instance_info` 中

### TC-E2E-021 `P1`：Agent CRUD 后指标更新

- **前置条件**：Exporter 和 Gateway 均已启动
- **操作步骤**：
  1. 记录 `opsfactory_agents_configured_total` 值
  2. 创建新 Agent
  3. 请求 `/metrics`
  4. 删除该 Agent
  5. 再次请求 `/metrics`
- **预期结果**：
  - 创建后 Agent 数量 +1
  - 删除后恢复原值

---

# 附录

## A. 测试数据准备清单

| 数据 | 说明 | 准备方式 |
|------|------|----------|
| 测试图片 | PNG/JPG，< 5MB | 准备 1-2 张测试图片 |
| 测试文件 | .txt, .md, .csv | 准备若干小型文本文件 |
| Office 文件 | .docx, .xlsx, .pptx | 准备各一个包含基本内容的文件 |
| 旧版 Office | .doc, .xls, .ppt | 准备各一个用于兼容性测试 |
| 大文件 | > 10MB | 用 `dd` 命令生成用于限制测试 |

## B. 环境变量参考

```bash
# Gateway
GATEWAY_HOST=0.0.0.0
GATEWAY_PORT=3000
GATEWAY_SECRET_KEY=test
GOOSED_BIN=goosed

# 可选服务开关
ENABLE_ONLYOFFICE=true
ENABLE_LANGFUSE=true
ENABLE_EXPORTER=true

# OnlyOffice
ONLYOFFICE_PORT=8080
OFFICE_PREVIEW_ENABLED=true
ONLYOFFICE_URL=http://localhost:8080

# Langfuse
LANGFUSE_PORT=3100
LANGFUSE_HOST=http://localhost:3100
LANGFUSE_PUBLIC_KEY=pk-lf-opsfactory
LANGFUSE_SECRET_KEY=sk-lf-opsfactory

# Exporter
EXPORTER_PORT=9091

# Web App
VITE_PORT=5173
```

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
curl -s http://localhost:3000/status

# 全量指标拉取
curl -s http://localhost:9091/metrics
```
