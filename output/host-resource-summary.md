# 系统资源管理模块 — 工作总结与技术方案

> 文档版本：2026-04-12
> 编写目的：面向项目组成员的技术交流，总结近期「系统资源管理」模块的设计思路、实现范围和后续规划。

---

## 一、背景与目标

在运维智能体平台中，主机资源是所有诊断、巡检、SOP 执行的基础对象。原有 `sop-workflow` 模块仅提供扁平化的主机列表管理（标签筛选、连接测试），无法表达 **分组 → 集群 → 主机** 的层级关系，也无法直观展示主机间的拓扑依赖。

本次工作目标是构建一套 **分层资源管理 + 拓扑可视化 + AI 自动发现** 能力，使运维人员能够：

1. 按环境组/集群对主机进行分层组织
2. 直观查看主机间调用链路与依赖关系
3. 利用 LLM + SSH 自动采集主机属性，降低手动录入成本

---

## 二、功能范围总览

| 能力域 | 功能点 | 状态 |
|:---|:---|:---:|
| 资源建模 | 环境组（HostGroup）CRUD | ✅ |
| | 集群（Cluster）CRUD，按类型分类 | ✅ |
| | 主机（Host）增强字段：OS / 位置 / 业务 / 自定义属性 | ✅ |
| | 主机关系（HostRelation）有向关联 | ✅ |
| 拓扑可视化 | 三区布局：资源树 + 主机卡片 + ECharts 拓扑图 | ✅ |
| | 按集群类型颜色编码（NSLB/RCPA/KAFKA 等） | ✅ |
| | 点击主机 1 跳聚焦 | ✅ |
| | 全屏切换 + 响应式缩放 | ✅ |
| AI 自动发现 | LLM 生成 SSH 探测命令 | ✅ |
| | JSch 远程执行 + LLM 解析结果 | ✅ |
| | 用户确认后回填表单 | ✅ |
| 安全 | 主机凭证 AES-GCM 加密存储 | ✅ |
| | 级联删除（删主机自动清理关系） | ✅ |
| | 删除保护（有子资源的组/集群禁止删除） | ✅ |
| 国际化 | 中/英文 i18n 全覆盖（~60 个 key） | ✅ |
| E2E 测试 | CRUD 全流程测试 | ✅ |
| | 自动发现端到端测试 | ✅ |
| | 示例数据场景测试（咪咕生产环境） | ✅ |

---

## 三、技术方案

### 3.1 整体架构

```
┌──────────────────────────────────────────────────────┐
│                    前端 (React/Vite)                   │
│  ┌─────────────────────────────────────────────────┐ │
│  │  host-resource 模块 (/host-resource)            │ │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────────────┐ │ │
│  │  │ResourceTree│ │HostCards │ │ RelationGraph   │ │ │
│  │  │ (左侧树)  │ │ (卡片网格)│ │ (ECharts 拓扑) │ │ │
│  │  └──────────┘ └──────────┘ └─────────────────┘ │ │
│  │  hooks: useHostResource / useClusters /         │ │
│  │         useHostGroups / useHostRelations        │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────┬───────────────────────────────┘
                       │ REST API (Gateway)
┌──────────────────────▼───────────────────────────────┐
│               后端 (Spring WebFlux)                    │
│  ┌────────────┐ ┌────────────┐ ┌──────────────────┐  │
│  │HostController│ │ClusterCtrl │ │HostGroupCtrl     │  │
│  └──────┬─────┘ └─────┬──────┘ └────────┬─────────┘  │
│         │             │                  │            │
│  ┌──────▼─────┐ ┌─────▼──────┐ ┌────────▼─────────┐  │
│  │ HostService │ │ClusterSvc  │ │HostGroupService  │  │
│  └──────┬─────┘ └────────────┘ └──────────────────┘  │
│         │                                             │
│  ┌──────▼──────────┐  ┌─────────────────────────┐    │
│  │HostDiscoverySvc  │  │HostRelationService      │    │
│  │(LLM + JSch/SSH) │  │(关系CRUD + 拓扑图构建)  │    │
│  └─────────────────┘  └─────────────────────────┘    │
│                                                       │
│  存储层: JSON 文件 (data/hosts/, data/clusters/...)   │
└───────────────────────────────────────────────────────┘
```

### 3.2 数据模型

```
HostGroup (环境组)          Cluster (集群)            Host (主机)
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ id              │     │ id              │     │ id              │
│ name            │◄────│ groupId         │     │ name / hostname │
│ parentId        │     │ name            │◄────│ clusterId       │
│ description     │     │ type (NSLB/...) │     │ ip / port / os  │
│ createdAt       │     │ purpose         │     │ authType/cred   │
│ updatedAt       │     │ description     │     │ business/tags   │
└─────────────────┘     └─────────────────┘     │ customAttrs     │
                                                 │ location/desc   │
                                                 └────────┬────────┘
                                                          │
                           HostRelation (关系)             │
                           ┌─────────────────┐            │
                           │ id              │            │
                           │ sourceHostId ───┼────────────┘
                           │ targetHostId ───┼────────────┘
                           │ description     │
                           └─────────────────┘
```

### 3.3 前端模块结构

```
web-app/src/app/modules/host-resource/
├── module.ts                          # 模块注册 (路由、导航、图标)
├── pages/
│   └── HostResourcePage.tsx           # 三区布局主页面 (345 行)
├── hooks/
│   ├── useHostResource.ts             # 主机 CRUD + 发现流程
│   ├── useClusters.ts                 # 集群 CRUD
│   ├── useHostGroups.ts               # 环境组 CRUD
│   └── useHostRelations.ts            # 关系 CRUD + 图数据
├── components/
│   ├── ResourceTree.tsx               # 左侧三级树导航
│   ├── ResourceFormModal.tsx          # 统一创建/编辑模态框 (764 行)
│   ├── HostCard.tsx                   # 主机信息卡片
│   ├── HostDetailPanel.tsx            # 主机详情浮层
│   ├── RelationGraph.tsx              # ECharts 拓扑图 (300 行)
│   ├── AttributeGroup.tsx             # 属性组展示
│   └── CustomAttributeEditor.tsx      # 键值对属性编辑器
└── styles/
    └── host-resource.css              # 布局样式 (585 行)

共计: 14 个文件, ~2750 行代码
```

### 3.4 后端新增文件

| 文件 | 行数 | 职责 |
|:---|---:|:---|
| `ClusterController.java` | 170 | 集群 REST 接口 |
| `HostGroupController.java` | 150 | 环境组 REST 接口 |
| `HostRelationController.java` | 128 | 关系 REST 接口 + 拓扑图数据 |
| `ClusterService.java` | 217 | 集群 JSON 文件 CRUD |
| `HostGroupService.java` | 238 | 环境组 JSON 文件 CRUD + 树构建 |
| `HostRelationService.java` | 335 | 关系 CRUD + ECharts 图构建 + 1跳扩展 |
| `HostDiscoveryService.java` | 318 | LLM 规划 + SSH 执行 + LLM 解析 |
| `SampleDataSeeder.java` | 31 | 占位（示例数据改由 E2E 注入） |

**已修改文件：**

| 文件 | 变更内容 |
|:---|:---|
| `HostController.java` | 新增 `clusterId`/`groupId` 筛选参数；新增 `discover-plan`/`discover-execute` 接口 |
| `HostService.java` | 新增按集群/组筛选、凭证 AES-GCM 加解密、级联删除关系、集群类型标签同步 |
| `AgentConfigService.java` | 新增 `getLlmConfig(agentId)` 方法，供发现服务读取 LLM 配置 |

后端新增共计: **~1590 行**；修改文件涉及 **~320 行增量**。

### 3.5 AI 自动发现流程

这是本次最具特色的功能，实现了 **LLM + SSH** 的两阶段自动发现：

```
用户点击"自动发现"
       │
       ▼
┌──────────────────────────────────────────┐
│ 阶段 1: Planning (LLM 生成命令)          │
│  POST /hosts/{id}/discover-plan          │
│  → 读取主机 IP/OS 信息                    │
│  → 调用 LLM 生成 7 条 SSH 探测命令        │
│  → 返回 [{label, command, purpose}]       │
└────────────────┬─────────────────────────┘
                 │ 用户勾选命令
                 ▼
┌──────────────────────────────────────────┐
│ 阶段 2: Execute (SSH 执行 + LLM 解析)    │
│  POST /hosts/{id}/discover-execute       │
│  → 解密主机凭证                          │
│  → JSch SSH 连接执行命令 (10s 超时)       │
│  → 原始输出交给 LLM 结构化提取            │
│  → 返回 formMappings + customAttributes  │
└────────────────┬─────────────────────────┘
                 │ 用户勾选结果
                 ▼
┌──────────────────────────────────────────┐
│ 自动回填: hostname / os / 自定义属性       │
└──────────────────────────────────────────┘
```

**安全设计要点：**
- 主机凭证使用 AES-256-GCM 加密存储，随机 IV，查询时脱敏为 `***`
- SSH 连接支持密码和密钥两种认证方式
- LLM 配置从 agent `config.yaml` → `custom_providers/*.json` → `secrets.yaml` 三级读取

---

## 四、API 接口清单

### 4.1 主机 `/gateway/hosts`

| 方法 | 路径 | 说明 |
|:---|:---|:---|
| GET | `/` | 列出主机 (支持 tags / clusterId / groupId 筛选) |
| GET | `/{id}` | 获取单个主机 |
| POST | `/` | 创建主机 |
| PUT | `/{id}` | 更新主机 |
| DELETE | `/{id}` | 删除主机 (级联删除关系) |
| GET | `/tags` | 获取所有标签 |
| POST | `/{id}/test` | 测试 SSH 连接 |
| **POST** | `/{id}/discover-plan` | **LLM 生成发现命令** |
| **POST** | `/{id}/discover-execute` | **SSH 执行 + LLM 解析** |

### 4.2 集群 `/gateway/clusters`

| 方法 | 路径 | 说明 |
|:---|:---|:---|
| GET | `/` | 列出集群 (支持 groupId / type 筛选) |
| GET | `/{id}` | 获取集群及关联主机 |
| GET | `/types` | 获取所有集群类型 |
| GET | `/{id}/hosts` | 获取集群下主机 |
| POST | `/` | 创建集群 |
| PUT | `/{id}` | 更新集群 |
| DELETE | `/{id}` | 删除集群 (有主机时拒绝) |

### 4.3 环境组 `/gateway/host-groups`

| 方法 | 路径 | 说明 |
|:---|:---|:---|
| GET | `/` | 列出所有组 |
| GET | `/tree` | 获取组→集群树结构 |
| GET | `/{id}` | 获取单个组 |
| POST | `/` | 创建组 |
| PUT | `/{id}` | 更新组 |
| DELETE | `/{id}` | 删除组 (有子资源时拒绝) |

### 4.4 关系 `/gateway/host-relations`

| 方法 | 路径 | 说明 |
|:---|:---|:---|
| GET | `/` | 列出关系 (支持 hostId / groupId / clusterId) |
| GET | `/graph` | 获取 ECharts 拓扑图数据 |
| POST | `/` | 创建关系 (校验源/目标存在性) |
| PUT | `/{id}` | 更新关系 |
| DELETE | `/{id}` | 删除关系 |

---

## 五、测试覆盖

| 测试文件 | 行数 | 覆盖范围 |
|:---|---:|:---|
| `host-resource-crud.spec.ts` | 530 | 四种资源全 CRUD 流程：树导航、卡片展示、详情面板、编辑回显、级联删除 |
| `host-auto-discovery.spec.ts` | 286 | API + UI 双层验证：命令生成、SSH 执行、结果回填、空命令边界 |
| `migu-sample-data.spec.ts` | 365 | 真实场景：咪咕生产环境 3 层架构 29 台主机 18 条关系的完整展示验证 |
| `whitelist-crud.spec.ts` | 251 | SOP 白名单 CRUD (关联功能) |

E2E 测试共计: **4 个文件, ~1430 行**。

---

## 六、工程量统计

| 层次 | 新增文件数 | 新增代码行 | 修改文件数 | 修改增量行 |
|:---|---:|---:|---:|---:|
| 前端模块 | 14 | ~2,750 | 4 (types/icons/validator/module-types) | ~180 |
| 后端服务 | 8 | ~1,590 | 3 (HostController/HostService/AgentConfigService) | ~320 |
| E2E 测试 | 4 | ~1,430 | — | — |
| i18n | — | — | 2 (en.json/zh.json) | ~150 |
| **合计** | **26** | **~5,770** | **9** | **~650** |

---

## 七、设计决策说明

### 7.1 为什么使用 JSON 文件存储？

当前阶段资源数据量有限（百级主机），使用 JSON 文件存储可以：
- **零运维成本**：无需数据库部署和维护
- **开发效率高**：Jackson 直接序列化/反序列化，无需 ORM
- **可迁移性强**：数据文件可直接拷贝和版本管理

后续如数据量增长或需要复杂查询，可平滑迁移至数据库（Service 接口不变，仅替换存储实现）。

### 7.2 为什么新增独立模块而非扩展现有 sop-workflow？

- **职责分离**：`sop-workflow` 侧重 SOP 流程编排，资源管理是独立关注点
- **独立演进**：资源管理未来可能对接 CMDB、监控系统等外部数据源
- **模块边界**：项目架构要求 modules 之间不直接引用，独立模块更清晰
- **兼容过渡**：现有 `sop-workflow/pages/Hosts.tsx` 保持不变，新旧模块可并行使用

### 7.3 自动发现为什么采用 LLM + SSH 两阶段？

- **安全性**：用户在阶段 1 可以审核 LLM 生成的命令，防止误操作
- **可控性**：用户选择性执行，不是全自动化盲目运行
- **灵活性**：LLM 可以根据主机 OS 类型生成不同命令（Linux vs AIX 等）
- **结构化提取**：LLM 将非结构化 CLI 输出转为结构化 JSON，比正则匹配更鲁棒

---

## 八、已知限制与后续规划

| 项目 | 当前状态 | 规划方向 |
|:---|:---|:---|
| 数据存储 | JSON 文件 | 评估接入 SQLite/MySQL |
| 批量导入 | 未支持 | CSV/Excel 批量导入主机 |
| 权限控制 | 仅 Admin 可访问 | 细粒度角色（只读/编辑/管理员） |
| 自动发现 | 手动触发 | 定时自动巡检 + 属性漂移检测 |
| 拓扑图 | 静态展示 | 支持拖拽编辑关系、流量动画 |
| 与 CMDB 对接 | 无 | 支持从外部 CMDB 同步主机数据 |
| 监控集成 | 无 | 关联 Prometheus 指标展示 |

---

## 九、E2E 示例数据场景说明

`migu-sample-data.spec.ts` 模拟了 **咪咕视频彩铃西南大区生产环境** 的真实场景：

```
西南大区
├── 共享服务
│   ├── 共享集群
│   │   └── KAFKA (消息队列) × 2
│   └── 网管集群 (GWDB)
├── 四川
│   ├── NSLB 集群 (负载均衡) × 2
│   ├── RCPA 集群 (呼叫代理) × 4
│   └── RCPADB 集群 (数据库) × 2
├── 重庆 (同构)
├── 贵州 (同构)
└── 云南 (同构)

调用链路: NSLB → RCPA → RCPADB (with KAFKA 旁路)
关系总数: 18 条
```

该测试验证了三区布局、树形导航、按集群筛选、拓扑图渲染、主机聚焦等核心交互。

---

*文档结束 — 欢迎项目组成员反馈讨论。*
