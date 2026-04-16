---
name: sop-diagnosis-execution
description: 根据用户输入的告警文本、根因分析结果或指定主机，自动匹配并执行SOP进行远程环境诊断。支持四种触发场景：衔接根因分析、告警驱动诊断、直接主机诊断、业务驱动诊断，统一走共享执行管道完成SOP匹配→执行→推荐→报告全流程。
version: 10.0.0
---

# SOP 环境实时诊断

## 组网拓扑

本系统维护完整的组网拓扑，通过 MCP 工具动态查询。拓扑包含两类节点和两类边：

**节点类型**：
| nodeType | 说明 | 位置 |
|----------|------|------|
| business-service | 典型业务服务 | 拓扑顶层（无入边） |
| host（缺省） | 主机，按 clusterType 区分层级 | 各层 |

**边类型**：
| type | 说明 | 方向 |
|------|------|------|
| business-entry | 业务入口关系（BS→entry host） | 业务服务→入口主机 |
| host-relation（缺省） | 主机间调用关系 | 上游主机→下游主机 |

**典型链路**：
```
[业务服务] ─entry─→ [NSLB 入口主机] ──→ [RCPA] ──→ [RCPADB / GWDB / KAFKA]
   第0层               第1层             第2层          第3层
```

**拓扑查询工具**：
- `get_host_topology(groupId?, clusterId?)` — 完整拓扑图（含 BS 节点）
- `get_host_neighbors(hostId)` — 指定主机 1 跳上下游
- `get_business_service_detail(id)` — 单个业务的完整拓扑链路（BS→entry→downstream）
- `get_host_groups_tree()` — 分组→集群层级树

## MCP 工具

| 工具 | 用途 |
|------|------|
| `list_sops(tags?)` | 列出SOP，可通过标签过滤 |
| `get_sop_detail(sopId)` | 获取SOP完整定义（含mermaid流程图） |
| `get_hosts(tags?)` | 查询主机列表 |
| `execute_remote_command(hostId, command, timeout?)` | 远程执行命令（输出自动保存为附件） |
| `execute_remote_command_batch(hostIds, command, timeout?)` | 多台主机并行执行同一命令，返回聚合结果 |
| `check_command_risk(command)` | 检查命令风险等级（low/medium/high） |
| `get_host_neighbors(hostId)` | 查询主机1跳拓扑邻居（含上下游方向和集群类型） |
| `get_host_topology(groupId?, clusterId?)` | 查询分组/集群级别拓扑图数据 |
| `get_host_groups_tree()` | 查询分组/集群层级树结构 |
| `get_business_services(groupId?, clusterId?, keyword?)` | 查询业务服务列表 |
| `get_business_service_detail(businessServiceId)` | 获取业务详情（含集群、主机、拓扑） |
| `get_business_service_hosts(businessServiceId)` | 获取业务关联主机列表 |
| `get_cluster_type_knowledge(hostId)` | 根据主机ID解析集群类型运维知识 |
| `get_cluster_types()` | 列出所有集群类型知识 |
| browser-use 系列 | 浏览器操作（navigate/click/type/screenshot/extract_content 等） |

### 工具访问控制

匹配到 SOP 后，检查其 `requiredTools` 字段：
- 若包含 `"sop-executor"` → 可使用所有 sop-executor 工具
- 若包含 `"browser-use"` → 可使用浏览器自动化工具
- 若缺失 → 默认推断：含 browser 类型节点则加入 `"browser-use"`，始终包含 `"sop-executor"`

**严格约束**：执行该 SOP 期间只能使用 `requiredTools` 中声明的工具。

## 触发场景与入口

根据上下文状态判断进入以下四个场景之一，各场景最终产出统一的 `{targetIPs, hostTags, alarmContext}` 后进入「共享执行流程」。

### 场景一：衔接根因分析后的环境诊断

- **触发条件**：上下文中已有根因分析结果（rootAlarm），用户要求进行环境诊断
- **输入来源**：root-cause-analysis skill 的输出
- **入口流程**：
  1. 直接从 rootAlarm 提取告警涉及的目标 IP 列表
  2. 从 rootAlarm 提取集群类别（haproxy / RCPA / RCPADB / GMDB / KAFKA）
  3. 调用 `get_hosts()` 按 IP 精确定位目标主机及其 tags
  4. 产出 `{targetIPs, hostTags, alarmContext=rootAlarm摘要}`
  5. 调用 `get_host_neighbors(hostId)` 获取目标主机的拓扑上下文，作为后续诊断升级参考
- **关键**：无缝衔接 root-cause-analysis skill 的输出，无需重新询问用户

### 场景二：基于告警的实时诊断

- **触发条件**：用户直接提供告警文本，上下文中无根因分析结果
- **输入来源**：用户消息中的告警文本
- **入口流程**：
  1. 从告警文本中提取 IP 地址和告警关键词
  2. 若提取到 IP → 调用 `get_hosts()` 按 IP 找到对应主机及其 tags
  3. 若告警文本包含业务名称关键词，优先调用 `get_business_services(keyword=...)` 匹配业务服务，若匹配到唯一业务则使用该业务的入口集群和拓扑，跳到步骤 5
  4. 若无 IP 但有关键词 → 从关键词推断类别（如提及"RCPA"→查 RCPA 主机，提及"数据库"/"DB"→查 RCPADB/GMDB），调用 `get_hosts(tags)` 获取主机列表
  5. 若无法推断类别 → 向用户确认目标主机类别，格式：
     ```
     请确认需要诊断的目标主机类别：
     - 负载均衡（haproxy）
     - 应用层（RCPA）
     - 数据层（RCPADB / GMDB / KAFKA）
     ```
  6. 产出 `{targetIPs, hostTags, alarmContext=告警文本摘要}`
  7. 若找到目标主机，调用 `get_host_neighbors(hostId)` 获取拓扑上下文

### 场景三：直接主机诊断

- **触发条件**：用户指定 IP 或主机类别（如"检查所有RCPA主机"、"诊断10.0.0.1"），无告警上下文
- **输入来源**：用户消息中的主机/类别指定
- **入口流程**：
  1. 解析用户输入：提取 IP 列表 或 类别关键词
  2. 类别映射参考：
     - 负载均衡 → haproxy / NSLB
     - 应用层 → RCPA
     - 数据层 → RCPADB / GMDB / KAFKA
  3. 若为类别关键词 → 调用 `get_hosts(tags)` 获取该类别所有主机
  4. 若为 IP → 调用 `get_hosts()` 获取全部主机后按 IP 过滤
  5. 确认目标主机列表，产出 `{targetIPs, hostTags, alarmContext=null}`

### 场景四：业务驱动的环境诊断

- **触发条件**：用户描述涉及业务名称或业务故障现象（如"彩铃查询业务成功率低"、"短信发送超时"），而非直接指定主机类别
- **入口流程**：

#### 4.1 业务匹配
  1. 从用户描述中提取业务关键词
  2. 调用 `get_business_services(keyword=关键词)` 模糊匹配
  3. 匹配到唯一 → 使用该业务服务
  4. 匹配到多个 → 展示候选列表（名称 + code）请用户确认
  5. 无匹配 → 降级到场景二/三

#### 4.2 获取拓扑链路
  6. 调用 `get_business_service_detail(id)` 获取完整上下文
  7. 从 `topology.nodes` 和 `topology.edges` 中解析调用链，按层级整理并展示给用户：

```
📊 业务诊断范围：{业务名称}

拓扑链路：
  [业务服务] {名称}
      ↓ entry host
  [NSLB] {入口主机名称} ({IP})
      ↓ {关系描述}
  [RCPA] {应用主机名称} ({IP})
      ↓ {关系描述}
  [RCPADB] {数据主机名称} ({IP})
```

#### 4.3 确定诊断起点
  8. 根据故障现象确定诊断起点层级：
     - 业务不可用/全部超时 → 从第1层（入口 NSLB）开始，逐层向下
     - 部分失败/慢查询 → 从第2层（应用层 RCPA）开始，重点关注数据层
     - 已知某层异常 → 直接从异常层开始
  9. 产出 `{targetIPs, hostTags, alarmContext, topologyChain}`：
     - `topologyChain`：完整拓扑数据，供后续逐层升级使用
  10. 进入「共享执行流程」

## 共享执行流程

各场景入口产出 `{targetIPs, hostTags, alarmContext}` 后，统一进入以下流程：

### 1. 信息准备

- 基于各场景产出的 `{targetIPs, hostTags, alarmContext}`，确认最终的目标主机列表
- 若目标主机为空，向用户说明并终止

### 1.5 回忆Memory知识

在进入SOP匹配与执行之前，检索 memory 中与目标主机类别相关的运维知识（如日志路径、配置文件位置、常见问题模式等），并在后续步骤中主动运用：

- **命令构造**：用 memory 中的路径信息补充 SOP 命令模板的变量（如日志目录、配置文件路径）
- **输出分析**：结合 memory 中的运维背景分析远程命令的执行结果
- **自然语言模式**：利用 memory 知识将步骤描述转化为更精确的诊断命令

### 1.7 加载集群类型知识

在 Memory 知识基础上，加载目标主机所属集群类型的运维知识：

1. 对每个目标主机调用 `get_cluster_type_knowledge(hostId)`
2. 去重：多台主机属于同一集群类型时仅保留一份知识
3. 将知识作为领域上下文注入后续诊断

知识用途：
- **命令构造**：从知识中获取常用诊断命令，将 SOP 自然语言步骤转化为具体命令
- **路径定位**：获取配置文件路径、日志路径
- **输出分析**：结合领域知识分析命令输出含义
- **自然语言 SOP**：将「检查进程状态」等抽象描述转化为精确命令

降级策略：
- 主机未关联集群 → 跳过
- 集群未设置类型 → 跳过
- 集群类型无匹配 → 跳过
- 降级不影响后续流程

### 2. 匹配SOP（增强版）

调用 `list_sops()` 建立 `tags → sopId` 映射，按以下优先级匹配 **一个最相关的SOP**：

- **优先（场景一、二）**：告警内容 vs SOP 的 `triggerCondition` 语义匹配
- **其次（场景三）**：主机 tags vs SOP 的 `tags`/`hostTags` 交集匹配
- **综合**：两者结合选最佳 SOP

若无法匹配任何 SOP，告知用户并终止。

### 2.5 生成执行计划（预演模式）

匹配到 SOP 后、执行任何远程命令之前，必须生成执行计划并等待用户确认：

1. 调用 `get_sop_detail(sopId)` 获取完整 SOP 定义
2. 对每个节点的命令调用 `check_command_risk(command)` 确定风险等级
3. 整理以下信息并输出给用户：

```
## 执行计划
**SOP**: {name} ({id})
**模式**: {structured | natural_language}
**目标主机**: {IP 列表及主机名}
**可用工具**: {requiredTools 列表}
**预计步骤**: {N} 个节点

### 执行序列
| # | 节点名称 | 类型 | 命令模板 | 风险等级 | 需确认 |
|---|---------|------|---------|---------|--------|
| 1 | ...     | ...  | ...     | low/medium/high | 是/否 |

### 分支条件
{列出每个 transition 的 condition 和目标节点}
```

4. ⛔ **立即停止，结束本轮对话**。输出确认提示：

```
⏸️ 请确认是否执行此计划？回复「执行」继续，「取消」终止，或调整目标主机。
```

**严格约束**：
- 用户明确回复「执行」前，⛔ 禁止调用 `execute_remote_command` 或 `execute_remote_command_batch`
- 必须结束本轮对话，等待用户下一轮回复后才可继续执行
- 用户回复「取消」→ 终止流程
- 用户调整目标主机 → 更新计划后重新展示并再次等待确认

### 3. 执行SOP

**每个SOP按其 nodes 数组中配置的节点依次执行，严格遵循节点定义的 transitions 分支逻辑。**

#### 准备
- 根据SOP的 `tags` 调用 `get_hosts`，**仅保留 IP 匹配目标主机列表的主机**
- 无匹配主机则跳过该SOP

#### 每个节点的执行

#### 风险分级执行策略

执行节点命令前，调用 `check_command_risk(command)` 确定风险等级：

| 风险等级 | 策略 | 示例命令 |
|---------|------|---------|
| **low** | 自动执行，直接报告结果 | ps, cat, grep, ls, df, free, tail, head, find, wc |
| **medium** | 自动执行，标注提示 | netstat, top, iostat, ping |
| **high** | **必须暂停**，展示命令和风险说明，等用户确认后才执行 | 白名单外的命令 |

**覆盖规则**：`requireHumanConfirm: true` 的 transition 无论风险等级，一律需用户确认。

**type=start 或 analysis：**
1. 读取 `command` 模板，替换 `{{变量}}`（优先用上下文推断，其次用 `defaultValue`）
2. 若目标主机 > 1 且命令相同 → 调用 `execute_remote_command_batch(hostIds, command)` 并行执行
3. 若目标主机 = 1 或命令因变量替换不同 → 分别调用 `execute_remote_command`
4. 根据 `analysisInstruction` 和 `outputFormat` 分析输出
5. 分支判断 → 见下方"分支判断规则"

**type=browser：**
1. `browser_navigate` 打开 `browserUrl` → 立即 `browser_screenshot`
2. `browser_get_state` 获取元素列表
3. 根据 `browserAction` 描述逐步操作（click/type/scroll等），每步完成后 `browser_screenshot`
4. `browser_extract_content` 提取数据 → `browser_screenshot`
5. `browser_close_all` 关闭浏览器
6. 根据 `analysisInstruction` 分析结果
7. 分支判断 → 同上

**type=end：** 该分支立即终止，标记"流程正常结束"。

#### 分支判断规则

评估当前节点的 `transitions`，逐条严格匹配：
- **条件满足 + `requireHumanConfirm: true`** → ⛔ **立即停止**，输出确认消息后结束本轮对话：
  ```
  ⏸️ 请确认是否继续检查「{后续节点名称}」？回复「继续」或「否」。
  ```
  用户回复后继续执行对应 nextNodes。
- **条件满足 + 无确认标记** → 执行对应 `nextNodes`
- **所有条件不满足** → 该分支终止
- **禁止**条件不满足时自行继续

#### 自然语言模式

当 `get_sop_detail` 返回自然语言模式 SOP（mode=natural_language）时：
1. 阅读 stepsDescription 中的步骤描述
2. 根据 SOP 的 tags 调用 `get_hosts`，仅保留 IP 匹配目标主机列表的主机
3. 逐步将描述转化为具体的 shell 诊断命令（只读命令，符合白名单）
4. 若目标主机 > 1 且命令相同 → 调用 `execute_remote_command_batch(hostIds, command)` 并行执行；若目标主机 = 1 或命令不同 → 分别调用 `execute_remote_command`
5. 分析输出，判断是否异常
6. 不需要生成 mermaid 流程图

### 4. 诊断结果处理与拓扑升级

SOP执行完成后，**必须停下来向用户反馈结果并决定下一步操作**。

#### 4.1 发现异常 → 拓扑升级分析

输出异常详情后，**自动进行拓扑升级**：

1. **场景四**：直接从 `topologyChain.edges` 中找到当前层主机的下游主机，无需额外调用 API
   **其他场景**：调用 `get_host_neighbors(hostId)` 获取上下游邻居
2. 结合异常类型分析故障传播方向：
   - **上游依赖故障**（如数据库不可达、外部服务超时）→ 标记「上游影响」
   - **本机根因**（如进程崩溃、资源耗尽）→ 标记「本机根因」，建议排查下游
   - **下游反馈异常**（如响应超时但本机正常）→ 标记「下游影响」
3. 向用户展示异常详情 + 拓扑升级建议：

```
❌ 「{当前SOP名称}」执行完成，发现异常。

**异常详情**：{异常描述}

**拓扑分析**：主机 {IP}（{clusterType}）的上下游关系：
- 上游：{列出上游主机 IP 及 clusterType}（数据/请求来源）
- 下游：{列出下游主机 IP 及 clusterType}（数据/请求去向）

**建议下一步**：
1. 检查上游主机 {IP列表} 是否存在类似异常（可能是根因向上传播）
2. 检查下游主机 {IP列表} 是否受此故障影响

回复「检查上游」「检查下游」或指定其他主机继续排查，或回复「生成报告」结束。
```

4. 用户确认后，进入步骤2匹配下一个SOP对推荐的主机进行诊断。

#### 4.2 未发现异常 → 沿拓扑链继续

**场景四**利用 `topologyChain` 的特殊逻辑：
1. 从 `topologyChain.edges` 中找到当前层主机的下游主机
2. 按 clusterType 确定下一层的 SOP 候选
3. 向用户展示：

```
✅ 第{N}层 [{clusterType}] 诊断完成，未发现异常。

根据拓扑链路，下一层为 [{下一层clusterType}]（{IP列表}）。
建议执行「{推荐的SOP}」进行诊断。

回复「继续」诊断下一层，或回复「生成报告」结束。
```

4. 用户确认后，回到步骤 2 匹配下一层的 SOP 并执行。

**其他场景**：调用 `get_host_neighbors(hostId)` 获取上下游，按现有逻辑推荐：

```
✅ 「{当前SOP名称}」执行完成，{涉及主机}未发现异常。

根据告警和拓扑关系，{当前clusterType}层正常。
上下游拓扑：
- 上游：{列出上游主机及类型}
- 下游：{列出下游主机及类型}

建议执行「{推荐的下一个SOP名称}」对 {目标主机IP} 进行诊断。

是否继续？回复「继续」或指定其他检查项。
```

#### 4.3 SOP 中可选的 escalationHints 配置

SOP JSON 可包含 `escalationHints` 字段来指导拓扑升级方向（可选，不配置则默认查询全部方向）：

```json
{
  "escalationHints": {
    "onAnomaly": "upstream | downstream | both | none",
    "targetClusterTypes": ["RCPADB", "KAFKA"],
    "description": "发现RCPA进程异常时，检查下游数据库和消息队列"
  }
}
```

- `onAnomaly: "upstream"` — 仅建议排查上游（如数据库故障影响应用）
- `onAnomaly: "downstream"` — 仅建议排查下游（如负载均衡故障影响后端）
- `onAnomaly: "both"` — 两个方向都建议（默认行为）
- `targetClusterTypes` — 缩小推荐范围到特定集群类型

### 5. 生成诊断报告

当发现异常或用户要求结束时，保存报告为 `./output/sop-diagnosis-report-{yyyyMMddHHmmss}.md`，结构：

```markdown
# SOP环境实时诊断报告
## 诊断概述
- 触发场景（场景一/二/三/四）、告警摘要或目标主机说明
- 场景四额外输出：业务名称、完整拓扑链路、各层诊断结果
- 已执行SOP列表、异常SOP

## SOP执行结果
### {category}环境诊断
- 执行状态：healthy / 异常
- 涉及主机
- 每个节点的：执行命令、日志附件路径、分析结论

## 综合分析
## 附件清单（必须填写实际文件路径）
## 处理建议
```

附件必须包含所有 `sop-exec-*.log` 和浏览器截图文件路径。

## 安全约束
- 命令必须在白名单内（ps/tail/grep/cat/ls/df/free/netstat/top/iostat/ping等只读命令）
- 禁止执行修改类命令（rm/mv/chmod/reboot/service等）
- 主机连接失败或命令超时：记录并继续
