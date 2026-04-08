# Web App 协同开发约定

本文面向 `web-app` 的日常协同开发，目标是让团队在并行开发 Sidebar 模块时保持边界稳定、减少交叉修改，并让新增代码自动符合当前前端分层和 CI 约束。

## 1. 当前前端如何划分

`web-app/src` 现在按两层组织：

- `app/platform/*`
  - 放整站共享的运行时和平台能力
  - 包括 shell、导航、provider、chat、preview、renderers、panels、runtime、styles、ui
- `app/modules/*`
  - 放业务模块自己的页面、私有组件、私有 hook、私有样式

根级 `web-app/src` 只保留入口和跨切面资源：

- `App.tsx`
- `main.tsx`
- `assets/*`
- `config/*`
- `i18n/*`
- `types/*`
- `utils/*`

不要再恢复这些旧目录：

- `src/pages`
- `src/components`
- `src/hooks`
- `src/contexts`

### 1.1 platform 层负责什么

`app/platform/*` 负责全局共享、且不应归属于单一业务模块的能力，例如：

- 应用外壳与布局
- Sidebar 导航
- 右侧面板
- Preview 能力
- Toast、User、Inbox、Sidebar、RightPanel、Goosed 等 provider
- 聊天输入、消息渲染、引用渲染、文件预览
- 共享 UI 原子件与页面模式组件

当前目录大致如下：

- `app/platform/navigation`
- `app/platform/providers`
- `app/platform/chat`
- `app/platform/preview`
- `app/platform/renderers`
- `app/platform/panels`
- `app/platform/runtime`
- `app/platform/ui`
- `app/platform/styles`

### 1.2 module 层负责什么

`app/modules/<module>/*` 只负责某个业务模块自己的实现。每个模块通常包含：

- `module.ts`
- `pages/*`
- `components/*`
- `hooks/*`
- `styles/*`

典型例子：

- `app/modules/agents/*`
- `app/modules/knowledge/*`
- `app/modules/history/*`

## 2. 模块是如何被自动加载的

当前 Sidebar 和路由不是手工集中注册，而是由模块自声明后自动汇总。

### 2.1 自加载入口

[ModuleLoader.ts](/Users/buyangnie/Documents/GitHub/ops-factory/web-app/src/app/platform/ModuleLoader.ts) 会通过：

```ts
import.meta.glob('../modules/**/module.ts', { eager: true })
```

扫描所有模块的 `module.ts`，拿到模块定义后统一做校验并缓存。

这意味着：

- 新模块只要提供符合约定的 `module.ts`
- 放在 `app/modules/<module>/module.ts`
- 就会被平台自动发现

### 2.2 Sidebar 如何生成

[NavigationBuilder.ts](/Users/buyangnie/Documents/GitHub/ops-factory/web-app/src/app/platform/NavigationBuilder.ts) 会遍历每个模块暴露的 `navItems`，按分组、权限和排序构建 Sidebar。

这里的关键点是：

- 模块自己声明导航项
- 平台统一决定如何汇总、过滤和排序
- Sidebar 本身不需要知道某个业务模块的具体实现

### 2.3 路由如何生成

[RouteBuilder.tsx](/Users/buyangnie/Documents/GitHub/ops-factory/web-app/src/app/platform/RouteBuilder.tsx) 会把每个模块导出的 `routes` 统一转换成 React Router 路由。

路由元素会经过统一的 `AccessGuard`，所以访问控制也是平台层处理的。

### 2.4 App 如何把平台能力包起来

[App.tsx](/Users/buyangnie/Documents/GitHub/ops-factory/web-app/src/App.tsx) 负责把整站 provider、shell、sidebar、right panel 串起来。`useEnabledModules()` 拿到当前可用模块，`buildRoutes()` 生成路由，Sidebar 由平台导航组件统一渲染。

所以当前模型可以概括成一句话：

- 模块负责声明
- 平台负责发现、汇总、承载和运行

## 3. 开发一个模块时，应该改哪些，不应该改哪些

### 3.1 应该改哪些

如果你在新增或迭代某个业务模块，优先只改这个模块自己的目录：

- `app/modules/<module>/module.ts`
- `app/modules/<module>/pages/*`
- `app/modules/<module>/components/*`
- `app/modules/<module>/hooks/*`
- `app/modules/<module>/styles/*`

典型场景：

- 新增一个 Sidebar 模块
- 给已有模块加新页面
- 给模块补私有组件
- 给模块补私有 hook
- 改模块自己的样式

### 3.2 什么时候可以改 platform

只有在下面这些情况，才应该动 `app/platform/*`：

- 多个模块明确需要复用同一能力
- 能力本身属于整站运行时，不属于单个业务模块
- 需要统一接入导航、provider、preview、right panel、chat、renderers、共享 UI

常见例子：

- 新增共享卡片、过滤器、workbench 模式组件
- 调整 preview、right panel、toast、user 等平台服务
- 调整聊天输入、消息渲染、引用渲染
- 调整应用壳层、导航和模块启用逻辑

### 3.3 不应该改哪些

开发一个模块时，不应该这样做：

- 不要直接 import 另一个业务模块的页面、组件、hook
- 不要把模块私有实现塞回根级 `src`
- 不要为了局部需求新建一套并行 provider 或全局状态流
- 不要在没有明确复用价值时，把模块代码过早提升到 `platform`

一句话判断：

- 只服务一个模块的，留在模块里
- 跨模块稳定复用的，才升到平台

### 3.4 一个新模块的最小落地方式

新增一个 Sidebar 模块时，最小需要：

1. 建目录 `app/modules/<module>/`
2. 提供 `module.ts`
3. 在模块内放页面与私有实现
4. 通过 `module.ts` 暴露 `routes` 和 `navItems`
5. 本地验证边界和构建

建议目录结构：

```text
app/modules/example/
  module.ts
  pages/
  components/
  hooks/
  styles/
```

## 4. 当前协同边界规则

### 4.1 目录边界

- 平台共享能力只能放在 `app/platform/*`
- 业务模块实现只能放在 `app/modules/<module>/*`
- 根级 `src` 不再承载前端实现层目录

### 4.2 依赖边界

- 模块可以依赖 `app/platform/*`
- 模块可以依赖根级 `config`、`types`、`utils`、`i18n`
- 模块不能直接依赖其他模块

### 4.3 边界检查

前端结构边界由：

- `cd web-app && npm run check:boundaries`

进行静态校验，并且已经接入 CI。

任何前端结构性变更之后，都应该至少执行：

```bash
cd web-app && npm run check:boundaries
cd web-app && npm run test:basic
cd web-app && npm run build
```

## 5. 测试协同约定

当前前端测试策略已经收紧，不再鼓励大范围 mock 页面运行时。

### 5.1 推荐保留和新增的测试

- 纯工具函数测试
- 纯 hook 测试
- 静态结构测试
- 边界规则测试
- 错误映射与平台行为的轻量测试

### 5.2 不建议再新增的测试

- 大量 `vi.mock(fetch)` 的页面测试
- 依赖全局 provider stub 拼整页运行时的测试
- 对源码相对路径或旧目录结构强耦合的脆弱测试

如果一个页面流程需要大量 mock 才能跑起来，优先考虑：

- 改成更小粒度的 hook 或工具测试
- 或者放到 Playwright / 更高层集成测试里

## 6. 团队协作时的“改动范围判断”

### 6.1 低风险改动

通常只改自己模块目录：

- 模块页面布局
- 模块私有组件
- 模块私有 hook
- 模块私有样式

### 6.2 中风险改动

会影响多个模块，但仍属于前端内部共享层：

- `app/platform/ui/*`
- `app/platform/chat/*`
- `app/platform/preview/*`
- `app/platform/renderers/*`
- `app/platform/panels/*`

这类改动要明确说明复用面和影响模块。

### 6.3 高风险改动

需要更谨慎评审：

- `app/platform/providers/*`
- `app/platform/navigation/*`
- `App.tsx`
- 模块启用、路由生成、访问控制、自加载链路

这类改动会直接影响整个应用壳层和多个 Sidebar 模块。

## 7. 规范遵循文档

当前前端协同开发应统一遵循以下文档：

- [AGENTS.md](/Users/buyangnie/Documents/GitHub/ops-factory/AGENTS.md)
- [CLAUDE.md](/Users/buyangnie/Documents/GitHub/ops-factory/CLAUDE.md)
- [ui-guidelines.md](/Users/buyangnie/Documents/GitHub/ops-factory/docs/development/ui-guidelines.md)
- [testing-guidelines.md](/Users/buyangnie/Documents/GitHub/ops-factory/docs/development/testing-guidelines.md)

各自职责：

- `AGENTS.md`
  - 仓库级开发规则
  - 前端分层和测试协同原则
- `CLAUDE.md`
  - 与 `AGENTS.md` 对齐的协作说明，供另一套代理规范使用
- `ui-guidelines.md`
  - UI 分层、页面模式、视觉和结构规则
- `testing-guidelines.md`
  - 前端边界检查、基础测试链和测试策略约束

如果个人习惯、旧文档、历史目录结构和这些规范冲突：

- 以当前平台/模块分层与上述文档为准

## 8. 开发前自检清单

开始一个前端任务前，先自检：

- 这次改动属于某个模块，还是属于平台共享能力
- 代码应该放进 `app/modules/<module>` 还是 `app/platform`
- 是否会引入跨模块直接依赖
- 是否真的需要新增共享抽象
- 是否需要补边界检查、基础测试和构建验证

提交前至少确认：

- 目录归属正确
- 没有重新引入根级实现目录
- `check:boundaries` 通过
- `test:basic` 通过
- `build` 通过
