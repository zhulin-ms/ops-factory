# 测试指南

## 拉取代码后的基础验证
对于“拉代码、做基础确认、再打包”的默认流程，请在仓库根目录执行以下基础冒烟脚本：

```bash
./scripts/verify-basic.sh
```

该脚本会覆盖主要代码组件：
- `web-app`：安装依赖，执行 `check:boundaries`、`test:basic`，再执行 `build`
- `typescript-sdk`：安装依赖，执行 `test:basic`，再执行 `build`
- `test`：执行仓库级轻量冒烟检查
- `gateway`：执行 `gateway-common` 单元测试，再对整个 gateway 执行跳过测试的打包
- `knowledge-service`：执行 `mvn test`，再打包
- `prometheus-exporter`：执行 `mvn test`，再打包
- `langfuse` 和 `onlyoffice`：如果本机可用 `docker compose`，校验 Compose 配置是否有效

建议把该脚本作为团队成员拉取仓库后的默认验收入口，用于确认本地工作区具备继续开发或生成本地构建产物的基本条件。

## 基础场景覆盖
`./scripts/verify-basic.sh` 主要覆盖以下基础场景：

| 场景 | 覆盖组件 | 检查方式 | 通过后说明 |
| --- | --- | --- | --- |
| 前端依赖与基础页面能力可用 | `web-app` | `npm ci` + `check:boundaries` + `test:basic` | 前端目录边界、基础依赖、运行时配置、文件预览等核心前端能力没有明显回归 |
| 前端生产打包可完成 | `web-app` | `npm run build` | 前端 TypeScript 编译和 Vite 打包链路可正常完成 |
| SDK 基础请求能力可用 | `typescript-sdk` | `test:basic` | SDK 的基础请求封装、请求头拼装、错误映射等关键逻辑正常 |
| SDK 可正常编译产物 | `typescript-sdk` | `npm run build` | SDK 可以生成可发布或可引用的编译结果 |
| 仓库级配置与脚本基础有效 | `test` | `basic-smoke.test.ts` | 关键配置文件存在，控制脚本语法正确，Docker 辅助组件配置结构有效 |
| Gateway 公共基础逻辑正常 | `gateway-common` | `mvn test` | Gateway 公共工具类、模型、路径/配置等底层能力正常 |
| Gateway 可完成整体打包 | `gateway` | `mvn -DskipTests package` | Gateway 当前代码至少可以成功编译并产出构建包 |
| 知识服务核心后端能力正常 | `knowledge-service` | `mvn test` | 知识服务的配置、数据库迁移、接口与集成链路基本可用 |
| 知识服务可完成打包 | `knowledge-service` | `mvn -DskipTests package` | 知识服务可以正常生成构建产物 |
| 监控导出服务核心能力正常 | `prometheus-exporter` | `mvn test` | 导出器的采集、配置加载、接口逻辑正常 |
| 监控导出服务可完成打包 | `prometheus-exporter` | `mvn -DskipTests package` | 导出器可以正常生成构建产物 |
| Docker 辅助组件配置有效 | `langfuse`、`onlyoffice` | `docker compose config -q` | Compose 文件和默认变量替换没有明显配置错误 |

这张表描述的是“基础确认”覆盖范围，不等同于完整回归测试。它的目标是帮助团队成员在刚拉取代码后，快速判断仓库是否处于可继续开发、可继续联调、可继续本地打包的状态。

## 测试与变更范围对应
- `web-app` UI 逻辑变更：优先在 `web-app/src/__tests__` 中新增或更新纯工具、纯 hook、静态边界或轻量渲染 Vitest 用例。
- Gateway Java 行为变更：在 `gateway/**/src/test/java` 下新增或更新 JUnit 用例。
- SDK 变更：更新 `typescript-sdk/tests`。
- 跨服务或路由行为变更：更新 `test/*.test.ts`。
- 端到端用户流程变更：更新 `test/e2e` 下的 Playwright 用例。

## 前端测试约束
- `web-app` 的结构性改动必须执行：

```bash
cd web-app && npm run check:boundaries
cd web-app && npm run test:basic
cd web-app && npm run build
```

- 不再新增依赖大范围 `vi.mock(fetch)`、全局 provider stub、或大段页面运行时重建的 mock-heavy 页面测试。
- 前端页面级用户流程若依赖真实路由、多个 provider、异步请求编排或复杂状态切换，优先使用 Playwright 或仓库级集成测试覆盖。
- Vitest 更适合覆盖以下内容：
  - 纯工具函数
  - 纯 hook 逻辑
  - 静态结构检查
  - 边界约束与错误处理映射
  - 不依赖大量 mock 的轻量渲染用例

## 最低要求
- Bug 修复在可行时应补充回归测试。
- API 或契约变更如果会影响用户可见行为，应同步更新单元/集成测试以及相关 E2E 场景。
- 启动方式或配置项变更在适用时应反映到脚本测试或配置测试中。

## 测试后清理规则
- 手工验证、Playwright 调试、一次性脚本排查、以及临时 E2E 演练在结束前必须清理验证过程中产生的临时过程文件，除非用户明确要求保留。
- 默认应清理的内容包括：`output/`、`.playwright-cli/`、临时截图、临时日志、一次性导出的快照文件，以及仅为排查而生成的 scratch 文件。
- 如果为了测试创建了临时 runtime 用户或会话，也应在验证完成后清理对应的 `gateway/users/<test-user>/...` 数据，不要把 `e2e-*`、`debug-*`、`test-*` 等目录长期留在工作区。
- 如果某些测试产物需要作为正式报告或仓库基线保留，应放入明确的归档位置（例如 `test/report/`）并在变更说明中说明保留原因，不要混放在临时目录中。
- 清理时避免误删长期保留的真实用户数据；如 `admin`、`robby` 或用户明确要求保留的运行态目录，不属于默认清理范围。

## 执行方式
如果只需要做一次快速的仓库级基础确认，请执行：

```bash
./scripts/verify-basic.sh
```

如果需要做更有针对性的模块验证或更深的回归检查，请按模块执行：

```bash
cd test && npm test
cd test && npm run test:e2e
cd gateway && mvn test
cd web-app && npm run check:boundaries
cd web-app && npm test
```

根目录基础冒烟脚本有意比全量回归更轻，适合日常拉代码后的快速确认。若你修改了特定子系统，或准备合并风险较高的变更，应继续执行上面的模块级测试命令。

Playwright 依赖应用栈已提前启动。
