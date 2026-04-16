// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const GATEWAY_URL = process.env.GATEWAY_URL || 'https://127.0.0.1:3000'
const GATEWAY_SECRET_KEY = process.env.GATEWAY_SECRET_KEY || 'test'
const API_PREFIX = '/gateway'
const OUTPUT_DIR = process.env.OUTPUT_DIR || './output'
const MAX_OUTPUT_SIZE = 1_000_000 // 1MB

// ---------------------------------------------------------------------------
// Gateway HTTP helper
// ---------------------------------------------------------------------------

export async function gw<T>(path: string, params?: Record<string, string>, method?: string, body?: unknown): Promise<T> {
  const url = new URL(`${GATEWAY_URL}${path}`)
  if (params && method !== 'POST') {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  const res = await fetch(url, {
    method: method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-secret-key': GATEWAY_SECRET_KEY,
      'x-user-id': 'admin',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Gateway ${path} returned ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Tool definitions (10 tools: 7 query + 3 execution)
// ---------------------------------------------------------------------------

export const tools = [
  // --- Query tools (7) ---
  {
    name: 'list_system_resources',
    description: '查询系统资源候选（系统名称 + 环境编码 Code）。当用户未明确系统或系统不唯一时，用于列出候选供用户选择。仅返回顶层系统资源（parentId 为空），支持 keyword 按系统名称或 Code 模糊匹配。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        keyword: { type: 'string', description: '关键词（可选），按系统名称或环境编码 Code 模糊匹配' },
        limit: { type: 'number', description: '返回条数（可选），默认 50，最大 200' },
      },
    },
  },
  {
    name: 'query_business_service_nodes',
    description: '根据业务名称关键词查询业务服务候选及其业务上下文摘要，用于辅助理解业务归属和影响范围。该工具默认不返回主机列表和完整拓扑，不能直接作为主机级诊断入口。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        keyword: { type: 'string', description: '业务名称关键词（必填）' },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'query_hosts_by_scope',
    description: '按明确资源范围查询主机列表，仅用于主机级诊断阶段。支持 groupName（分组名称模糊匹配）、clusterName（集群名称模糊匹配）、clusterType（集群类型精确匹配）。必须提供调用原因 reason，且禁止无范围参数时枚举全部主机。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        groupName: { type: 'string', description: '分组名称（可选，模糊匹配）' },
        clusterName: { type: 'string', description: '集群名称（可选，模糊匹配）' },
        clusterType: { type: 'string', description: '集群类型（可选，精确匹配，如RCPA、HAPROXY、NSLB）' },
        reason: { type: 'string', description: '调用原因（必填）：explicit_scope 或 health_root_alarm' },
        evidence: { type: 'string', description: '辅助说明调用依据，例如 rootAlarm、alarmName、clusterName、用户明确输入的范围' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'get_host_neighbors',
    description: '查询指定主机的直接连接邻居（1跳拓扑），返回上游（incoming）和下游（outgoing）主机列表及其集群类型。用于诊断升级：发现异常后查询关联主机的上下游依赖，判断故障是否可能传播。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        hostId: { type: 'string', description: '主机ID' },
      },
      required: ['hostId'],
    },
  },
  {
    name: 'get_cluster_type_knowledge',
    description: '根据主机ID解析其所属集群类型的运维知识。依次查询主机→集群→集群类型，返回集群类型中存储的knowledge字段（常用诊断命令、配置文件路径、日志路径等领域知识）。用于将SOP中的抽象检查描述转化为具体操作命令。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        hostId: { type: 'string', description: '目标主机ID' },
      },
      required: ['hostId'],
    },
  },
  {
    name: 'list_sops',
    description: '列出所有可用的SOP诊断流程，包含id、名称、触发条件。可通过tags过滤。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '按标签过滤（如["haproxy"]），返回tags中包含任一指定标签的SOP',
        },
      },
    },
  },
  {
    name: 'get_sop_detail',
    description: '获取SOP的完整流程定义，包含所有节点、变量定义、分支条件和命令模板。用于了解SOP的完整执行流程。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        sopId: { type: 'string', description: 'SOP ID' },
      },
      required: ['sopId'],
    },
  },
  {
    name: 'get_cluster_types',
    description: '列出所有集群类型及其knowledge字段。返回集群类型的名称、编码、描述和运维知识。用于批量浏览或搜索特定集群类型的领域知识。',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'save_markdown_report',
    description: '将最终诊断报告保存为本地 Markdown 文件到输出目录。用于将模型生成的最终报告落盘，避免仅在对话中输出。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        fileName: { type: 'string', description: '输出文件名（可选）。默认 system-health-analysis-{yyyyMMddHHmmss}.md' },
        content: { type: 'string', description: 'Markdown 内容（必填）' },
      },
      required: ['content'],
    },
  },
  // --- Execution tools (3) ---
  {
    name: 'execute_remote_command',
    description: '通过SSH在远程主机上执行诊断命令并返回输出。命令必须符合白名单要求。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        hostId: { type: 'string', description: '目标主机ID' },
        command: { type: 'string', description: '要执行的命令（支持管道和分号链接）' },
        timeout: { type: 'number', description: '超时时间(秒)，默认30' },
      },
      required: ['hostId', 'command'],
    },
  },
  {
    name: 'execute_remote_command_batch',
    description: '通过SSH在多台远程主机上并行执行同一诊断命令，返回聚合结果。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        hostIds: { type: 'array', items: { type: 'string' }, description: '目标主机ID列表' },
        command: { type: 'string', description: '要执行的命令' },
        timeout: { type: 'number', description: '超时(秒)，默认30' },
      },
      required: ['hostIds', 'command'],
    },
  },
  {
    name: 'check_command_risk',
    description: '检查命令的风险等级。返回 low（自动执行）、medium（自动执行并标注）或 high（需用户确认）。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: '要检查的命令' },
      },
      required: ['command'],
    },
  },
]

// ---------------------------------------------------------------------------
// Mermaid generation
// ---------------------------------------------------------------------------

interface SopNode {
  id?: string
  name: string
  type: string
  transitions?: { condition: string; nextNodes?: string[]; nextNodeId?: string; requireHumanConfirm?: boolean }[]
}

interface SopData {
  name?: string
  nodes?: SopNode[]
  mode?: string
  enabled?: boolean
  stepsDescription?: string
  tags?: string[]
  requiredTools?: string[]
  [key: string]: unknown
}

export function sopToMermaid(sop: SopData): string {
  const nodes = sop.nodes ?? []
  if (nodes.length === 0) return 'graph TD\n    empty["空SOP"]'

  // Build name → index mapping (nextNodeId stores the target node's name)
  const nameToIndex = new Map<string, number>()
  nodes.forEach((n, i) => nameToIndex.set(n.name, i))

  const lines: string[] = ['graph TD']

  // Node declarations
  nodes.forEach((node, i) => {
    const label = node.name.replace(/"/g, "'")
    if (node.type === 'start') {
      lines.push(`    N${i}(["${label}"])`)
    } else if (node.type === 'browser') {
      lines.push(`    N${i}{{"${label}"}}`)
    } else if (node.type === 'end') {
      lines.push(`    N${i}((("${label}")))`)
    } else {
      lines.push(`    N${i}["${label}"]`)
    }
  })

  // Edges with conditions
  nodes.forEach((node, i) => {
    for (const t of node.transitions ?? []) {
      // nextNodes is an array of target node names
      const targets = t.nextNodes ?? (t.nextNodeId ? [t.nextNodeId] : [])
      for (const targetName of targets) {
        const targetIdx = nameToIndex.get(targetName)
        if (targetIdx !== undefined) {
          const cond = (t.condition || '').replace(/"/g, "'")
          const suffix = t.requireHumanConfirm ? ' (需确认)' : ''
          lines.push(`    N${i} -->|"${cond}${suffix}"| N${targetIdx}`)
        }
      }
    }
  })

  // Style start nodes (indigo), browser nodes (amber), and human-confirm nodes (green)
  nodes.forEach((node, i) => {
    if (node.type === 'start') {
      lines.push(`    style N${i} fill:#e0e7ff,stroke:#6366f1,stroke-width:2px`)
    } else if (node.type === 'browser') {
      lines.push(`    style N${i} fill:#fef3c7,stroke:#f59e0b,stroke-width:2px`)
    } else if (node.type === 'end') {
      lines.push(`    style N${i} fill:#fee2e2,stroke:#dc2626,stroke-width:2px`)
    }
  })

  return lines.join('\n')
}

interface ContentItem {
  type: 'text' | 'resource'
  text?: string
  resource?: {
    uri: string
    mimeType: string
    text: string
  }
}

export function buildMermaidResource(mermaidCode: string, title: string): ContentItem {
  return {
    type: 'resource',
    resource: {
      uri: `ui://sop-executor/mermaid/${encodeURIComponent(title)}`,
      mimeType: 'text/html',
      text: `<div class="mermaid">\n${mermaidCode}\n</div>`,
    },
  }
}

// ---------------------------------------------------------------------------
// Field-picking helpers & constants
// ---------------------------------------------------------------------------

function pick(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const k of keys) {
    if (k in obj) result[k] = obj[k]
  }
  return result
}

function pickEach(arr: Record<string, unknown>[], keys: string[]): Record<string, unknown>[] {
  return arr.map(item => pick(item, keys))
}

const HOST_LIST_KEYS     = ['id', 'name', 'businessIp', 'clusterId', 'tags', 'purpose']
const HOST_NODE_KEYS     = ['id', 'name', 'businessIp', 'clusterType', 'clusterName']
const SOP_LIST_KEYS      = ['id', 'name', 'tags', 'mode', 'enabled']
const CT_LIST_KEYS       = ['id', 'name', 'code', 'description', 'knowledge']
const SYSTEM_LIST_KEYS   = ['id', 'name', 'code']
const VALID_SCOPE_REASONS = new Set(['explicit_scope', 'health_root_alarm'])

function formatTimestampForFile(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('')
}

function sanitizeFileName(fileName: string): string {
  const trimmed = fileName.trim()
  if (!trimmed) return ''
  const normalized = trimmed.replace(/[\\/]/g, '_')
  return normalized.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, '_')
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

export async function handleListSystemResources(params?: { keyword?: string; limit?: number }): Promise<string> {
  const keyword = String(params?.keyword ?? '').trim()
  const rawLimit = params?.limit
  const limit = typeof rawLimit === 'number' && Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(200, Math.floor(rawLimit)))
    : 50

  const data = await gw<{ groups: Record<string, unknown>[] }>(`${API_PREFIX}/host-groups`)
  const allGroups = data.groups ?? []
  const systems = allGroups.filter(g => g.parentId == null)

  const filtered = keyword
    ? systems.filter(s => {
      const name = String(s.name ?? '')
      const code = String(s.code ?? '')
      const lower = keyword.toLowerCase()
      return name.toLowerCase().includes(lower) || code.toLowerCase().includes(lower)
    })
    : systems

  const candidates = pickEach(filtered, SYSTEM_LIST_KEYS).slice(0, limit)

  if (systems.length === 0) {
    return JSON.stringify({
      matchCount: 0,
      message: '当前未配置任何系统资源（顶层分组）。请先在“系统资源”页签中创建系统，并填写 Code（环境编码 envCode）。',
    }, null, 2)
  }

  if (keyword && filtered.length === 0) {
    return JSON.stringify({
      matchCount: 0,
      message: `未找到匹配「${keyword}」的系统资源（按系统名称或 Code 模糊匹配）`,
      totalSystems: systems.length,
    }, null, 2)
  }

  return JSON.stringify({
    matchCount: filtered.length,
    returned: candidates.length,
    totalSystems: systems.length,
    message: keyword ? '已按关键词筛选系统资源候选' : '已列出系统资源候选（Code 为环境编码 envCode）',
    candidates,
  }, null, 2)
}

export async function handleQueryBusinessServiceNodes(keyword: string): Promise<string> {
  // Step 1: Search business services by keyword
  const data = await gw<{ businessServices: Record<string, unknown>[] }>(
    `${API_PREFIX}/business-services`,
    { keyword },
  )
  const services = data.businessServices ?? []

  if (services.length === 0) {
    return JSON.stringify({
      matchCount: 0,
      message: `未找到匹配「${keyword}」的业务服务`,
    }, null, 2)
  }

  if (services.length > 1) {
    // Multiple matches — return candidate list for disambiguation
    const candidates = pickEach(services, ['id', 'name', 'code'])
    return JSON.stringify({
      matchCount: services.length,
      message: '匹配到多个业务服务，请确认目标',
      candidates,
    }, null, 2)
  }

  // Unique match — return business context summary instead of host topology.
  const bs = services[0]
  const bsId = String(bs.id)
  const resolved = await gw<Record<string, unknown>>(`${API_PREFIX}/business-services/${encodeURIComponent(bsId)}/resolved`)

  const businessService = pick(bs, ['id', 'name', 'code', 'groupId', 'tags'])
  const resolvedSummary = pick(
    (resolved.resolved as Record<string, unknown> | undefined) ?? resolved,
    ['id', 'name', 'code', 'groupId', 'groupName', 'envCode', 'systemName', 'tags']
  )

  return JSON.stringify({
    matchCount: 1,
    message: '已匹配到业务服务。请先结合系统健康分析、异常指标和告警根因收敛异常集群或根因告警，再决定是否进入主机级诊断。',
    businessService,
    resolvedSummary,
    nextStep: 'health_analysis_first',
  }, null, 2)
}

/**
 * Recursively find a group node by name (case-insensitive fuzzy match).
 */
function findGroupByName(
  tree: Record<string, unknown>[],
  name: string,
): Record<string, unknown> | undefined {
  const lowerName = name.toLowerCase()
  for (const node of tree) {
    const nodeName = String(node.name ?? '').toLowerCase()
    if (nodeName.includes(lowerName)) return node
    const children = node.children as Record<string, unknown>[] | undefined
    if (Array.isArray(children)) {
      const found = findGroupByName(children, name)
      if (found) return found
    }
  }
  return undefined
}

export async function handleQueryHostsByScope(params?: {
  groupName?: string
  clusterName?: string
  clusterType?: string
  reason?: string
  evidence?: string
}): Promise<string> {
  const { groupName, clusterName, clusterType, reason, evidence } = params ?? {}

  if (!reason || !VALID_SCOPE_REASONS.has(reason)) {
    return JSON.stringify({
      success: false,
      reason: 'missing_or_invalid_reason',
      message: 'query_hosts_by_scope 必须提供合法的调用原因 reason，可选值为 explicit_scope 或 health_root_alarm',
    }, null, 2)
  }

  if (!groupName && !clusterName && !clusterType) {
    return JSON.stringify({
      success: false,
      reason: 'scope_required',
      message: 'query_hosts_by_scope 仅支持在明确范围后查询主机，禁止无范围参数枚举全部主机',
      allowedReasons: Array.from(VALID_SCOPE_REASONS),
    }, null, 2)
  }

  // Resolve groupId from groupName
  let groupId: string | undefined
  if (groupName) {
    const treeData = await gw<Record<string, unknown>>(`${API_PREFIX}/host-groups/tree`)
    const tree = (treeData.tree ?? treeData) as Record<string, unknown>[]
    const treeArray = Array.isArray(tree) ? tree : [tree]
    const matchedGroup = findGroupByName(treeArray, groupName)
    if (matchedGroup && matchedGroup.id) {
      groupId = String(matchedGroup.id)
    }
  }

  // Resolve clusterId from clusterName and/or clusterType
  let clusterId: string | undefined
  if (clusterName || clusterType) {
    const queryParams: Record<string, string> = {}
    if (clusterType) queryParams.type = clusterType
    const clusterData = await gw<{ clusters: Record<string, unknown>[] }>(
      `${API_PREFIX}/clusters`,
      queryParams,
    )
    let clusters = clusterData.clusters ?? []

    // Further filter by clusterName (fuzzy match)
    if (clusterName) {
      const lowerClusterName = clusterName.toLowerCase()
      clusters = clusters.filter((c: Record<string, unknown>) =>
        String(c.name ?? '').toLowerCase().includes(lowerClusterName),
      )
    }

    if (clusters.length === 1) {
      clusterId = String(clusters[0].id)
    } else if (clusters.length > 1) {
      // Multiple clusters matched — return them for disambiguation
      return JSON.stringify({
        matchCount: clusters.length,
        message: '匹配到多个集群，请缩小范围',
        clusters: pickEach(clusters, ['id', 'name', 'type']),
      }, null, 2)
    }
    // clusters.length === 0: no cluster found, fall through
  }

  // Query hosts using resolved filters
  // Note: gateway API treats clusterId and groupId as mutually exclusive (first match wins).
  // We prefer clusterId (more specific) over groupId.
  const hostParams: Record<string, string> = {}
  if (clusterId) {
    hostParams.clusterId = clusterId
  } else if (groupId) {
    hostParams.groupId = groupId
  }

  // If we have a clusterType but couldn't resolve a clusterId,
  // and also have no groupId, we need to get all hosts and filter by cluster type
  if (!clusterId && !groupId && clusterType) {
    const data = await gw<{ hosts: Record<string, unknown>[] }>(`${API_PREFIX}/hosts`)
    // Filter hosts whose tags include the clusterType
    const filtered = (data.hosts ?? []).filter((h: Record<string, unknown>) => {
      const tags = (h.tags ?? []) as string[]
      return tags.some(t => t.toLowerCase() === clusterType.toLowerCase())
    })
    return JSON.stringify({
      success: true,
      reason,
      evidence: evidence ?? '',
      filter: { clusterType },
      hosts: pickEach(filtered, HOST_LIST_KEYS).map(({ businessIp, ...rest }) => ({ ...rest, ip: businessIp })),
    }, null, 2)
  }

  if (Object.keys(hostParams).length === 0) {
    return JSON.stringify({
      success: false,
      reason: 'scope_not_resolved',
      message: '未能根据当前范围解析出可查询的主机范围，请先收敛到明确集群、分组或资源类型',
      inputScope: { groupName: groupName ?? '', clusterName: clusterName ?? '', clusterType: clusterType ?? '' },
      evidence: evidence ?? '',
    }, null, 2)
  }

  const data = await gw<{ hosts: Record<string, unknown>[] }>(`${API_PREFIX}/hosts`, hostParams)
  return JSON.stringify({
    success: true,
    reason,
    evidence: evidence ?? '',
    hosts: pickEach(data.hosts ?? [], HOST_LIST_KEYS).map(({ businessIp, ...rest }) => ({ ...rest, ip: businessIp })),
  }, null, 2)
}

export async function handleSaveMarkdownReport(params?: { fileName?: string; content?: string }): Promise<string> {
  const content = String(params?.content ?? '')
  if (!content.trim()) {
    return JSON.stringify({
      success: false,
      reason: 'empty_content',
      message: 'content 不能为空',
    }, null, 2)
  }

  const ts = formatTimestampForFile(new Date())
  const rawName = params?.fileName ?? `system-health-analysis-${ts}.md`
  const safeName = sanitizeFileName(rawName) || `system-health-analysis-${ts}.md`

  mkdirSync(OUTPUT_DIR, { recursive: true })
  const filePath = join(OUTPUT_DIR, safeName)

  let finalContent = content
  let truncated = false
  if (finalContent.length > MAX_OUTPUT_SIZE) {
    truncated = true
    finalContent = finalContent.slice(0, MAX_OUTPUT_SIZE) + '\n\n... [内容超过 1MB，已截断] ...\n'
  }

  writeFileSync(filePath, finalContent, 'utf-8')

  return JSON.stringify({
    success: true,
    fileName: safeName,
    path: filePath,
    truncated,
  }, null, 2)
}

export async function handleListSops(tags?: string[]): Promise<string> {
  const data = await gw<{ sops: Record<string, unknown>[] }>(`${API_PREFIX}/sops`)
  let sops = data.sops ?? []
  // Filter out disabled SOPs
  sops = sops.filter(s => s.enabled !== false)
  if (tags && tags.length > 0) {
    sops = sops.filter(s => {
      const sTags = (s.tags ?? []) as string[]
      return sTags.some((t: string) => tags.includes(t))
    })
  }
  return JSON.stringify({ sops: pickEach(sops, SOP_LIST_KEYS) }, null, 2)
}

export async function handleGetSopDetail(sopId: string): Promise<ContentItem[]> {
  const data = await gw<Record<string, unknown>>(`${API_PREFIX}/sops/${sopId}`)
  // API returns { success: true, sop: { nodes: [...] } } — extract inner sop object
  const sop = (data.sop ?? data) as SopData

  // Auto-infer requiredTools if missing
  if (!sop.requiredTools || sop.requiredTools.length === 0) {
    const tools = new Set<string>(['sop-executor'])
    for (const node of sop.nodes ?? []) {
      if (node.type === 'browser') tools.add('browser-use')
    }
    sop.requiredTools = Array.from(tools)
  }

  // Natural language mode — return steps description without mermaid flowchart
  if (sop.mode === 'natural_language') {
    const parts: string[] = []
    parts.push(`SOP 模式: 自然语言 (natural_language)`)
    if (sop.tags && sop.tags.length > 0) {
      parts.push(`目标标签: ${sop.tags.join(', ')}`)
    }
    parts.push(`可用工具范围: ${sop.requiredTools.join(', ')}`)
    parts.push('')
    parts.push('---')
    parts.push('')
    parts.push('诊断步骤描述:')
    parts.push(sop.stepsDescription || '（无步骤描述）')
    parts.push('')
    parts.push('---')
    parts.push('')
    parts.push('执行指引:')
    parts.push('1. 根据上述步骤描述，逐步推导出具体的 shell 诊断命令（只读命令，符合白名单）')
    parts.push('2. 只有当目标主机范围已由用户明确指定，或已由健康分析收敛到明确根因对象时，才允许调用 query_hosts_by_scope')
    parts.push('3. 调用 query_hosts_by_scope 时必须提供 reason（explicit_scope 或 health_root_alarm）以及对应 evidence')
    parts.push('4. 对每台目标主机调用 execute_remote_command 执行诊断命令')
    parts.push('5. 分析输出，判断是否异常')
    parts.push('6. 不需要生成 mermaid 流程图')

    return [{ type: 'text', text: parts.join('\n') }]
  }

  // Structured mode — existing logic
  const mermaidCode = sopToMermaid(sop)

  // Embed confirmation warning directly into each transition that requires it.
  const confirmWarning = '⛔ 匹配到此条件时必须立即停止，向用户确认后才能继续执行后续节点'
  const sopWithWarnings = JSON.parse(JSON.stringify(data)) as Record<string, unknown>
  const inner = (sopWithWarnings.sop ?? sopWithWarnings) as SopData
  let hasConfirm = false
  for (const node of inner.nodes ?? []) {
    for (const tr of node.transitions ?? []) {
      if (tr.requireHumanConfirm) {
        hasConfirm = true
        ;(tr as Record<string, unknown>)['_confirmWarning'] = confirmWarning
      }
    }
  }

  const parts: string[] = []

  if (hasConfirm) {
    parts.push('⚠️ 本 SOP 包含需要人工确认的条件分支（requireHumanConfirm=true）。')
    parts.push('当 transitions 条件匹配到 requireHumanConfirm=true 的分支时：')
    parts.push('1. 立即停止，不调用任何工具')
    parts.push('2. 输出：⏸️ 请确认是否继续检查「{后续节点名称}」？回复「继续」或「否」。')
    parts.push('3. 结束本轮对话，等用户回复后再继续')
    parts.push('')
  }

  parts.push(`可用工具范围: ${sop.requiredTools.join(', ')}`)
  parts.push('')

  parts.push(JSON.stringify(sopWithWarnings, null, 2))
  parts.push('')
  parts.push('---')
  parts.push('')
  parts.push('SOP 流程图（必须向用户展示）：')
  parts.push('')
  parts.push('```mermaid')
  parts.push(mermaidCode)
  parts.push('```')

  const textContent: ContentItem = {
    type: 'text',
    text: parts.join('\n'),
  }
  const mermaidResource = buildMermaidResource(mermaidCode, String(sop.name ?? sopId))
  return [textContent, mermaidResource]
}

export async function handleGetHostNeighbors(hostId: string): Promise<string> {
  const data = await gw<Record<string, unknown>>(
    `${API_PREFIX}/host-relations/hosts/${encodeURIComponent(hostId)}/neighbors`
  )
  // Trim nodes to essential fields and remove redundant 'direction' from each neighbor
  const trimNeighbors = (arr: Record<string, unknown>[]) =>
    (arr ?? []).map((n: Record<string, unknown>) => {
      const node = (n.host ?? n.node) as Record<string, unknown> | undefined
      return {
        ...(node ? { node: (({ businessIp, ...rest }: Record<string, unknown>) => ({ ...rest, ip: businessIp }))(pick(node, HOST_NODE_KEYS) as Record<string, unknown>) } : {}),
        ...((n.relationDescription ?? n.relationType) != null
          ? { relationDescription: n.relationDescription ?? n.relationType }
          : {}),
      }
    })
  const upstream = trimNeighbors(data.upstream as Record<string, unknown>[] ?? [])
  const downstream = trimNeighbors(data.downstream as Record<string, unknown>[] ?? [])
  return JSON.stringify({ upstream, downstream }, null, 2)
}

export async function handleExecuteRemote(hostId: string, command: string, timeout?: number): Promise<string> {
  const data = await gw<Record<string, unknown>>(`${API_PREFIX}/remote/execute`, undefined, 'POST', {
    hostId,
    command,
    timeout: timeout ?? 30,
  })

  // Save execution output as attachment file
  try {
    const hostName = String(data.hostName || hostId)
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
    const safeName = hostName.replace(/[^a-zA-Z0-9_\u4e00-\u9fff-]/g, '_')
    const fileName = `sop-exec-${safeName}-${timestamp}.log`

    mkdirSync(OUTPUT_DIR, { recursive: true })

    let content = [
      `=== SOP 远程执行输出 ===`,
      `主机: ${hostName} (${hostId})`,
      `命令: ${command}`,
      `退出码: ${data.exitCode}`,
      `耗时: ${data.duration}ms`,
      `时间: ${new Date().toISOString()}`,
      ``,
      `--- 标准输出 ---`,
      String(data.output || ''),
      ``,
      `--- 标准错误 ---`,
      String(data.error || ''),
    ].join('\n')

    if (content.length > MAX_OUTPUT_SIZE) {
      content = content.slice(0, MAX_OUTPUT_SIZE) + '\n\n... [输出超过 1MB，已截断] ...'
    }

    writeFileSync(join(OUTPUT_DIR, fileName), content, 'utf-8')
  } catch (writeErr) {
    console.error('[sop-executor] Failed to write output file:', writeErr)
  }

  return JSON.stringify(data, null, 2)
}

export async function handleCheckCommandRisk(command: string): Promise<string> {
  const data = await gw<Record<string, unknown>>(`${API_PREFIX}/remote/check-risk`, undefined, 'POST', {
    command,
  })
  return JSON.stringify(data, null, 2)
}

const MAX_CONCURRENCY = 5

export async function handleExecuteRemoteBatch(hostIds: string[], command: string, timeout?: number): Promise<string> {
  const results: Record<string, unknown>[] = []
  const errors: Record<string, unknown>[] = []
  const finalTimeout = timeout ?? 30

  // Process in chunks of MAX_CONCURRENCY
  for (let i = 0; i < hostIds.length; i += MAX_CONCURRENCY) {
    const chunk = hostIds.slice(i, i + MAX_CONCURRENCY)
    const settled = await Promise.allSettled(
      chunk.map(hostId =>
        gw<Record<string, unknown>>(`${API_PREFIX}/remote/execute`, undefined, 'POST', {
          hostId,
          command,
          timeout: finalTimeout,
        }).then(data => {
          // Save output file for each host
          try {
            const hostName = String(data.hostName || hostId)
            const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
            const safeName = hostName.replace(/[^a-zA-Z0-9_\u4e00-\u9fff-]/g, '_')
            const fileName = `sop-exec-${safeName}-${timestamp}.log`

            mkdirSync(OUTPUT_DIR, { recursive: true })

            let content = [
              `=== SOP 远程执行输出 ===`,
              `主机: ${hostName} (${hostId})`,
              `命令: ${command}`,
              `退出码: ${data.exitCode}`,
              `耗时: ${data.duration}ms`,
              `时间: ${new Date().toISOString()}`,
              ``,
              `--- 标准输出 ---`,
              String(data.output || ''),
              ``,
              `--- 标准错误 ---`,
              String(data.error || ''),
            ].join('\n')

            if (content.length > MAX_OUTPUT_SIZE) {
              content = content.slice(0, MAX_OUTPUT_SIZE) + '\n\n... [输出超过 1MB，已截断] ...'
            }

            writeFileSync(join(OUTPUT_DIR, fileName), content, 'utf-8')
          } catch (writeErr) {
            console.error('[sop-executor] Failed to write output file:', writeErr)
          }

          return { hostId, status: 'fulfilled', data }
        })
      )
    )

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(result.value.data)
      } else {
        const failedHost = chunk[settled.indexOf(result)]
        errors.push({ hostId: failedHost, error: String(result.reason) })
      }
    }
  }

  const summary = {
    totalHosts: hostIds.length,
    succeeded: results.length,
    failed: errors.length,
    results,
    errors,
  }
  return JSON.stringify(summary, null, 2)
}

export async function handleGetClusterTypeKnowledge(hostId: string): Promise<string> {
  // Step 1: Get host to find clusterId
  let hostData: Record<string, unknown>
  try {
    hostData = await gw<Record<string, unknown>>(`${API_PREFIX}/hosts/${encodeURIComponent(hostId)}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const hint = /returned 404/.test(msg)
      ? `hostId 应为主机的 id 字段（UUID），而非 IP 地址。请使用 query_hosts_by_scope 先获取主机列表，从中取 id 字段`
      : msg
    return JSON.stringify({
      found: false,
      reason: 'host_not_found',
      message: `未找到主机 ${hostId}：${hint}`,
    }, null, 2)
  }
  const host = (hostData.host ?? hostData) as Record<string, unknown>
  const clusterId = host.clusterId as string | undefined

  if (!clusterId) {
    return JSON.stringify({
      found: false,
      reason: 'host_no_cluster',
      message: `主机 ${hostId} 未关联集群`,
    }, null, 2)
  }

  // Step 2: Get cluster to find type string
  const clusterData = await gw<Record<string, unknown>>(`${API_PREFIX}/clusters/${encodeURIComponent(clusterId)}`)
  const cluster = (clusterData.cluster ?? clusterData) as Record<string, unknown>
  const clusterTypeStr = cluster.type as string | undefined

  if (!clusterTypeStr) {
    return JSON.stringify({
      found: false,
      reason: 'cluster_no_type',
      message: `集群 ${clusterId} 未设置类型`,
    }, null, 2)
  }

  // Step 3: Get all cluster types and match
  const typesData = await gw<{ clusterTypes: Record<string, unknown>[] }>(`${API_PREFIX}/cluster-types`)
  const clusterTypes = typesData.clusterTypes ?? []

  const matched = clusterTypes.find(ct => {
    const name = ct.name as string | undefined
    const code = ct.code as string | undefined
    return (name != null && name === clusterTypeStr) ||
           (code != null && code.toLowerCase() === clusterTypeStr.toLowerCase())
  })

  if (!matched) {
    return JSON.stringify({
      found: false,
      reason: 'no_matching_cluster_type',
      message: `未找到匹配的集群类型「${clusterTypeStr}」`,
    }, null, 2)
  }

  return JSON.stringify({
    found: true,
    knowledge: matched.knowledge ?? '',
  }, null, 2)
}

export async function handleGetClusterTypes(): Promise<string> {
  const data = await gw<{ clusterTypes: Record<string, unknown>[] }>(`${API_PREFIX}/cluster-types`)
  return JSON.stringify({ clusterTypes: pickEach(data.clusterTypes ?? [], CT_LIST_KEYS) }, null, 2)
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export async function dispatch(name: string, args: Record<string, unknown>): Promise<string | ContentItem[]> {
  switch (name) {
    case 'list_system_resources':
      return handleListSystemResources({
        keyword: (args as { keyword?: string }).keyword,
        limit: (args as { limit?: number }).limit,
      })
    case 'query_business_service_nodes':
      return handleQueryBusinessServiceNodes((args as { keyword?: string }).keyword ?? '')
    case 'query_hosts_by_scope':
      return handleQueryHostsByScope({
        groupName: (args as { groupName?: string }).groupName,
        clusterName: (args as { clusterName?: string }).clusterName,
        clusterType: (args as { clusterType?: string }).clusterType,
        reason: (args as { reason?: string }).reason,
        evidence: (args as { evidence?: string }).evidence,
      })
    case 'get_host_neighbors':
      return handleGetHostNeighbors((args as { hostId?: string }).hostId ?? '')
    case 'get_cluster_type_knowledge':
      return handleGetClusterTypeKnowledge((args as { hostId?: string }).hostId ?? '')
    case 'list_sops':
      return handleListSops(
        (args as { tags?: string[] }).tags,
      )
    case 'get_sop_detail':
      return handleGetSopDetail((args as { sopId?: string }).sopId ?? '')
    case 'get_cluster_types':
      return handleGetClusterTypes()
    case 'save_markdown_report':
      return handleSaveMarkdownReport({
        fileName: (args as { fileName?: string }).fileName,
        content: (args as { content?: string }).content,
      })
    case 'execute_remote_command':
      return handleExecuteRemote(
        (args as { hostId?: string }).hostId ?? '',
        (args as { command?: string }).command ?? '',
        (args as { timeout?: number }).timeout,
      )
    case 'execute_remote_command_batch':
      return handleExecuteRemoteBatch(
        (args as { hostIds?: string[] }).hostIds ?? [],
        (args as { command?: string }).command ?? '',
        (args as { timeout?: number }).timeout,
      )
    case 'check_command_risk':
      return handleCheckCommandRisk((args as { command?: string }).command ?? '')
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
