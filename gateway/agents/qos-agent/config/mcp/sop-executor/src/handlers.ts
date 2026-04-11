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
// Tool definitions
// ---------------------------------------------------------------------------

export const tools = [
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
    name: 'get_hosts',
    description: '获取管理的主机列表，可通过标签过滤。传入tags参数返回匹配任一标签的主机。',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: '按标签过滤（如["RCPA"]），返回tags中包含任一标签的主机',
        },
      },
    },
  },
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
// Tool handlers
// ---------------------------------------------------------------------------

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
  return JSON.stringify({ sops }, null, 2)
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
    parts.push(`📋 SOP 模式: 自然语言 (natural_language)`)
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
    parts.push('2. 根据 SOP 的 tags 调用 get_hosts，仅保留 IP 匹配告警的主机')
    parts.push('3. 对每台目标主机调用 execute_remote_command 执行诊断命令')
    parts.push('4. 分析输出，判断是否异常')
    parts.push('5. 不需要生成 mermaid 流程图')
    parts.push('')
    parts.push(JSON.stringify(data, null, 2))

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

export async function handleGetHosts(tags?: string[]): Promise<string> {
  const params: Record<string, string> = {}
  if (tags && tags.length > 0) {
    params.tags = tags.join(',')
  }
  const data = await gw<{ hosts: Record<string, unknown>[] }>(`${API_PREFIX}/hosts`, params)
  return JSON.stringify(data, null, 2)
}

export async function handleExecuteRemote(hostId: string, command: string, timeout?: number): Promise<string> {
  const data = await gw<Record<string, unknown>>(`${API_PREFIX}/remote/execute`, undefined, 'POST', {
    hostId,
    command,
    timeout: timeout ?? 30,
  })

  // 将执行输出保存为附件文件
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
    // 文件写入失败不影响工具返回
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

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export async function dispatch(name: string, args: Record<string, unknown>): Promise<string | ContentItem[]> {
  switch (name) {
    case 'list_sops':
      return handleListSops(
        (args as { tags?: string[] }).tags,
      )
    case 'get_sop_detail':
      return handleGetSopDetail((args as { sopId?: string }).sopId ?? '')
    case 'get_hosts':
      return handleGetHosts((args as { tags?: string[] }).tags)
    case 'execute_remote_command':
      return handleExecuteRemote(
        (args as { hostId?: string }).hostId ?? '',
        (args as { command?: string }).command ?? '',
        (args as { timeout?: number }).timeout,
      )
    case 'check_command_risk':
      return handleCheckCommandRisk((args as { command?: string }).command ?? '')
    case 'execute_remote_command_batch':
      return handleExecuteRemoteBatch(
        (args as { hostIds?: string[] }).hostIds ?? [],
        (args as { command?: string }).command ?? '',
        (args as { timeout?: number }).timeout,
      )
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
