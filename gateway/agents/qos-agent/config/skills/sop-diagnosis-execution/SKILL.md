---
name: sop-diagnosis-execution
description: 当用户明确要求进行远程诊断时（如"环境诊断"、"执行SOP"、"实时诊断"、"环境排查"、"远程诊断"），根据告警信息匹配一个SOP并执行诊断，根据告警IP精确定位目标主机，诊断完成后根据结果推荐下一步SOP检查，由用户确认是否继续，最终生成综合诊断报告。
version: 7.0.0
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

## 执行流程

### 1. 解析告警

从用户消息中提取告警列表，每条告警提取 **集群类型**（取值见上方「组网拓扑」表）和 **节点IP**。无告警则向用户确认。

### 2. 匹配SOP

调用 `list_sops()` 建立 `tags → sopId` 映射。根据告警的集群类型，匹配 **一个最相关的SOP** 执行诊断。

### 3. 执行SOP

**每个SOP按其 nodes 数组中配置的节点依次执行，严格遵循节点定义的 transitions 分支逻辑。**

#### 准备
- 根据SOP的 `tags` 调用 `get_hosts`，**仅保留 IP 匹配告警的主机**
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
2. 根据 SOP 的 tags 调用 `get_hosts`，仅保留 IP 匹配告警的主机
3. 逐步将描述转化为具体的 shell 诊断命令（只读命令，符合白名单）
4. 对每台目标主机调用 `execute_remote_command` 执行
5. 分析输出，判断是否异常
6. 不需要生成 mermaid 流程图

### 4. 诊断结果处理与下一步推荐

SOP执行完成后，**必须停下来向用户反馈结果并推荐下一步操作**：

- **发现异常**：输出异常详情，生成诊断报告（步骤5），流程结束。
- **未发现异常（healthy）**：向用户展示当前SOP的诊断结论，并根据告警信息和组网拓扑关系，推荐下一个值得检查的SOP，停下来等待用户确认。推荐格式：
  ```
  ✅ {当前category}环境检查未发现异常。

  根据告警和当前诊断结果，建议继续进行「{推荐的下一个category}」环境检查。

  是否继续？回复「继续」或指定其他检查项。
  ```

  用户确认后，回到步骤2匹配下一个SOP并执行。

### 5. 生成诊断报告

当发现异常或用户要求结束时，保存报告为 `./output/sop-diagnosis-report-{yyyyMMddHHmmss}.md`，结构：

```markdown
# SOP环境实时诊断报告
## 诊断概述
- 告警队列、已执行SOP列表、异常SOP

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
