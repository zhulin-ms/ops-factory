---
name: sop-diagnosis-execution
description: 根据用户输入的告警文本、根因分析结果或指定主机，自动匹配并执行SOP进行远程环境诊断。支持三种触发场景：衔接根因分析、告警驱动诊断、直接主机诊断，统一走共享执行管道完成SOP匹配→执行→推荐→报告全流程。
version: 8.0.0
---

# SOP 环境实时诊断

## 组网拓扑

```
haproxy → RCPA → RCPADB / GMDB / KAFKA
```

| category | 说明 |
|----------|------|
| haproxy | 负载均衡 |
| RCPA | 应用层 |
| RCPADB / GMDB / KAFKA | 数据层 |

## MCP 工具

| 工具 | 用途 |
|------|------|
| `list_sops(tags?)` | 列出SOP，可通过标签过滤 |
| `get_sop_detail(sopId)` | 获取SOP完整定义（含mermaid流程图） |
| `get_hosts(tags?)` | 查询主机列表 |
| `execute_remote_command(hostId, command, timeout?)` | 远程执行命令（输出自动保存为附件） |
| browser-use 系列 | 浏览器操作（navigate/click/type/screenshot/extract_content 等） |

## 触发场景与入口

根据上下文状态判断进入以下三个场景之一，各场景最终产出统一的 `{targetIPs, hostTags, alarmContext}` 后进入「共享执行流程」。

### 场景一：衔接根因分析后的环境诊断

- **触发条件**：上下文中已有根因分析结果（rootAlarm），用户要求进行环境诊断
- **输入来源**：root-cause-analysis skill 的输出
- **入口流程**：
  1. 直接从 rootAlarm 提取告警涉及的目标 IP 列表
  2. 从 rootAlarm 提取集群类别（haproxy / RCPA / RCPADB / GMDB / KAFKA）
  3. 调用 `get_hosts()` 按 IP 精确定位目标主机及其 tags
  4. 产出 `{targetIPs, hostTags, alarmContext=rootAlarm摘要}`
- **关键**：无缝衔接 root-cause-analysis skill 的输出，无需重新询问用户

### 场景二：基于告警的实时诊断

- **触发条件**：用户直接提供告警文本，上下文中无根因分析结果
- **输入来源**：用户消息中的告警文本
- **入口流程**：
  1. 从告警文本中提取 IP 地址和告警关键词
  2. 若提取到 IP → 调用 `get_hosts()` 按 IP 找到对应主机及其 tags
  3. 若无 IP 但有关键词 → 从关键词推断类别（如提及"RCPA"→查 RCPA 主机，提及"数据库"/"DB"→查 RCPADB/GMDB），调用 `get_hosts(tags)` 获取主机列表
  4. 若无法推断类别 → 向用户确认目标主机类别，格式：
     ```
     请确认需要诊断的目标主机类别：
     - 负载均衡（haproxy）
     - 应用层（RCPA）
     - 数据层（RCPADB / GMDB / KAFKA）
     ```
  5. 产出 `{targetIPs, hostTags, alarmContext=告警文本摘要}`

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

## 共享执行流程

各场景入口产出 `{targetIPs, hostTags, alarmContext}` 后，统一进入以下流程：

### 1. 信息准备

- 基于各场景产出的 `{targetIPs, hostTags, alarmContext}`，确认最终的目标主机列表
- 若目标主机为空，向用户说明并终止

### 2. 匹配SOP（增强版）

调用 `list_sops()` 建立 `tags → sopId` 映射，按以下优先级匹配 **一个最相关的SOP**：

- **优先（场景一、二）**：告警内容 vs SOP 的 `triggerCondition` 语义匹配
- **其次（场景三）**：主机 tags vs SOP 的 `tags`/`hostTags` 交集匹配
- **综合**：两者结合选最佳 SOP

若无法匹配任何 SOP，告知用户并终止。

### 3. 执行SOP

**每个SOP按其 nodes 数组中配置的节点依次执行，严格遵循节点定义的 transitions 分支逻辑。**

#### 准备
- 根据SOP的 `tags` 调用 `get_hosts`，**仅保留 IP 匹配目标主机列表的主机**
- 无匹配主机则跳过该SOP

#### 每个节点的执行

**type=start 或 analysis：**
1. 读取 `command` 模板，替换 `{{变量}}`（优先用上下文推断，其次用 `defaultValue`）
2. 对每台目标主机调用 `execute_remote_command`
3. 根据 `analysisInstruction` 和 `outputFormat` 分析输出
4. 分支判断 → 见下方"分支判断规则"

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
4. 对每台目标主机调用 `execute_remote_command` 执行
5. 分析输出，判断是否异常
6. 不需要生成 mermaid 流程图

### 4. 诊断结果处理与下一步推荐

SOP执行完成后，**必须停下来向用户反馈结果并推荐下一步操作**：

- **发现异常**：输出异常详情，生成诊断报告（步骤5），流程结束。
- **未发现异常（healthy）**：向用户展示当前SOP的诊断结论，结合告警信息、诊断结果和组网拓扑，判断是否有值得继续检查的SOP。推荐时应明确指出建议执行的SOP名称和目标主机IP，格式：
  ```
  ✅ 「{当前SOP名称}」执行完成，{涉及主机}未发现异常。

  根据告警和当前诊断结果，建议执行「{推荐的下一个SOP名称}」对 {目标主机IP} 进行诊断。

  是否继续？回复「继续」或指定其他检查项。
  ```

  如果根据当前诊断结果找不到合适的下一步SOP，则不强制推荐，直接告知用户当前诊断结论即可：
  ```
  ✅ 「{当前SOP名称}」执行完成，{涉及主机}未发现异常。

  根据当前诊断结果，暂无明确的下一步检查建议。如需继续请指定检查项。
  ```

  用户确认后，回到步骤2匹配下一个SOP并执行。

### 5. 生成诊断报告

当发现异常或用户要求结束时，保存报告为 `./output/sop-diagnosis-report-{yyyyMMddHHmmss}.md`，结构：

```markdown
# SOP环境实时诊断报告
## 诊断概述
- 触发场景（场景一/二/三）、告警摘要或目标主机说明
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
