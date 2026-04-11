/**
 * QA Agent — End-to-End Tests
 *
 * Covers:
 *   1. qa-agent is registered in gateway
 *   2. knowledge-service MCP is attached to qa-agent
 *   3. MCP tools are exposed on a real session
 *   4. end-to-end conversation triggers search/fetch and emits chunk-level citations
 *
 * Notes:
 * - This suite starts a dedicated Java gateway with a higher per-user instance limit
 *   so resident prewarm does not block qa-agent startup.
 * - knowledge-service is expected to be reachable at http://127.0.0.1:8092.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import net from 'node:net'
import { sleep, type GatewayHandle } from './helpers.js'

const AGENT_ID = 'qa-agent'
const USER_SYS = 'admin'
const SECRET_KEY = 'test-secret'
const PROJECT_ROOT = join(import.meta.dirname, '..')
const MCP_DIR = join(PROJECT_ROOT, 'gateway', 'agents', 'qa-agent', 'config', 'mcp', 'knowledge-service')

let gw: GatewayHandle

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

async function startQaJavaGateway(): Promise<GatewayHandle> {
  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}/ops-gateway`

  const jarPath = join(PROJECT_ROOT, 'gateway', 'gateway-service', 'target', 'gateway-service.jar')
  const libDir = join(PROJECT_ROOT, 'gateway', 'gateway-service', 'target', 'lib')
  const log4jConfig = join(PROJECT_ROOT, 'gateway', 'gateway-service', 'target', 'resources', 'log4j2.xml')

  const child = spawn('java', [
    `-Dloader.path=${libDir}`,
    `-Dserver.port=${port}`,
    '-Dserver.address=127.0.0.1',
    `-Dgateway.secret-key=${SECRET_KEY}`,
    `-Dgateway.goosed-bin=${process.env.GOOSED_BIN || 'goosed'}`,
    '-Dgateway.goosed-tls=true',
    `-Dgateway.paths.project-root=${PROJECT_ROOT}`,
    '-Dgateway.cors-origin=*',
    '-Dgateway.limits.max-instances-per-user=20',
    '-Dgateway.limits.max-instances-global=100',
    `-Dlogging.config=file:${log4jConfig}`,
    '-jar', jarPath,
  ], {
    cwd: join(PROJECT_ROOT, 'gateway'),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const logs: string[] = []
  child.stdout?.on('data', (d: Buffer) => {
    const line = d.toString().trim()
    if (line) logs.push(`[gw:out] ${line}`)
  })
  child.stderr?.on('data', (d: Buffer) => {
    const line = d.toString().trim()
    if (line) logs.push(`[gw:err] ${line}`)
  })

  const waitUntilReady = async () => {
    const maxWait = 30_000
    const start = Date.now()
    while (Date.now() - start < maxWait) {
      try {
        const res = await fetch(`${baseUrl}/status`, {
          headers: { 'x-secret-key': SECRET_KEY },
          signal: AbortSignal.timeout(2_000),
        })
        if (res.ok) return
      } catch {
        // not ready yet
      }
      await sleep(500)
    }
    throw new Error(`Gateway failed to start\n${logs.join('\n')}`)
  }

  await waitUntilReady()

  const headers = (userId?: string) => {
    const h: Record<string, string> = {
      'x-secret-key': SECRET_KEY,
      'Content-Type': 'application/json',
    }
    if (userId) h['x-user-id'] = userId
    return h
  }

  return {
    port,
    baseUrl,
    secretKey: SECRET_KEY,
    process: child,
    logs,
    fetch: (path, init) =>
      fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers('admin'), ...init?.headers } }),
    fetchAs: (userId, path, init) =>
      fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers(userId), ...init?.headers } }),
    stop: async () => {
      child.kill('SIGTERM')
      await sleep(3_000)
      if (!child.killed) child.kill('SIGKILL')
      await sleep(500)
    },
  }
}

function makeUserMessage(text: string) {
  return {
    role: 'user',
    created: Math.floor(Date.now() / 1000),
    content: [{ type: 'text', text }],
    metadata: { userVisible: true, agentVisible: true },
  }
}

function parseSseEvents(body: string): Array<Record<string, any>> {
  return body
    .split('\n\n')
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .flatMap(chunk => {
      const data = chunk
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.replace(/^data:\s*/, ''))
        .join('\n')
      if (!data) return []
      try {
        return [JSON.parse(data)]
      } catch {
        return []
      }
    })
}

function collectAssistantTextFromSse(events: Array<Record<string, any>>): string {
  return events
    .filter(event => event.type === 'Message' && event.message)
    .flatMap(event => (event.message.content || []) as Array<{ type: string; text?: string }>)
    .filter(content => content.type === 'text' && typeof content.text === 'string')
    .map(content => content.text || '')
    .join('')
}

function extractToolNames(events: Array<Record<string, any>>): string[] {
  return events
    .filter(event => event.type === 'Message' && event.message)
    .flatMap(event => (event.message.content || []) as Array<Record<string, any>>)
    .filter(content => content.type === 'toolRequest')
    .map(content =>
      content.toolCall?.value?.name ||
      content.toolCall?.name ||
      ''
    )
    .filter(Boolean)
}

async function sendReplyAndWait(
  handle: GatewayHandle,
  userId: string,
  agentId: string,
  sessionId: string,
  message: string,
  timeoutMs = 120_000,
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await handle.fetchAs(userId, `/agents/${agentId}/agent/reply`, {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        user_message: makeUserMessage(message),
      }),
      signal: controller.signal,
    })
    return await res.text()
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}

async function createSessionAndChat(
  handle: GatewayHandle,
  userId: string,
  agentId: string,
  message: string,
) {
  const startRes = await handle.fetchAs(userId, `/agents/${agentId}/agent/start`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  expect(startRes.ok).toBe(true)
  const session = await startRes.json()
  const sessionId = session.id as string

  const resumeRes = await handle.fetchAs(userId, `/agents/${agentId}/agent/resume`, {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, load_model_and_extensions: true }),
  })
  expect(resumeRes.ok).toBe(true)

  const replyBody = await sendReplyAndWait(handle, userId, agentId, sessionId, message)
  return { sessionId, replyBody }
}

beforeAll(async () => {
  if (!existsSync(join(MCP_DIR, 'node_modules'))) {
    execFileSync('npm', ['install'], { cwd: MCP_DIR, stdio: 'inherit' })
  }
  execFileSync('npm', ['run', 'build'], { cwd: MCP_DIR, stdio: 'inherit' })
  gw = await startQaJavaGateway()
  await sleep(2_000)
}, 90_000)

afterAll(async () => {
  if (gw) await gw.stop()
}, 20_000)

describe('qa-agent registration and MCP wiring', () => {
  it('lists qa-agent with the expected provider and model', async () => {
    const res = await gw.fetchAs(USER_SYS, '/agents')
    expect(res.ok).toBe(true)
    const data = await res.json()
    const qa = (data.agents as Array<Record<string, any>>).find(agent => agent.id === AGENT_ID)
    expect(qa).toBeDefined()
    expect(qa!.name).toBe('QA Agent')
    expect(qa!.provider).toBe('custom_qwen3-32b')
    expect(qa!.model).toBe('qwen/qwen3-32b')
  })

  it('exposes the knowledge-service MCP extension on /agents/qa-agent/mcp', async () => {
    const res = await gw.fetchAs(USER_SYS, `/agents/${AGENT_ID}/mcp`)
    expect(res.ok).toBe(true)
    const data = await res.json() as Record<string, any>
    const extensions = data.extensions as Array<Record<string, any>>
    const knowledge = extensions.find(ext => ext.name === 'knowledge-service')
    expect(knowledge).toBeDefined()
    expect(knowledge!.enabled).toBe(true)
    expect(knowledge!.type).toBe('stdio')
    expect(knowledge!.cmd).toBe('npx')
    expect(knowledge!.args).toEqual(['tsx', 'config/mcp/knowledge-service/src/index.ts'])
  })
})

describe('qa-agent MCP runtime', () => {
  it('loads search and fetch tools on a real session', async () => {
    const startRes = await gw.fetchAs(USER_SYS, `/agents/${AGENT_ID}/agent/start`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(startRes.ok).toBe(true)
    const session = await startRes.json()
    const sessionId = session.id as string

    const resumeRes = await gw.fetchAs(USER_SYS, `/agents/${AGENT_ID}/agent/resume`, {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, load_model_and_extensions: true }),
    })
    expect(resumeRes.ok).toBe(true)

    const res = await gw.fetchAs(USER_SYS, `/agents/${AGENT_ID}/agent/tools?session_id=${sessionId}`)
    expect(res.ok).toBe(true)
    const tools = await res.json() as Array<Record<string, any>>
    const names = tools.map(tool => tool.name as string)

    expect(names.some(name => name.includes('search'))).toBe(true)
    expect(names.some(name => name.includes('fetch'))).toBe(true)
  }, 60_000)

  it('supports real MCP search and fetch calls through stdio', async () => {
    const script = `
      import { Client } from '@modelcontextprotocol/sdk/client/index.js'
      import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

      const transport = new StdioClientTransport({
        command: 'node',
        args: ['dist/index.js'],
        cwd: process.cwd(),
        env: {
          ...process.env,
          KNOWLEDGE_SERVICE_URL: 'http://127.0.0.1:8092',
          KNOWLEDGE_REQUEST_TIMEOUT_MS: '15000',
        },
      })

      const client = new Client({ name: 'qa-agent-test', version: '1.0.0' }, { capabilities: {} })
      await client.connect(transport)

      const tools = await client.listTools()
      const searchResult = await client.callTool({ name: 'search', arguments: { query: '运维', topK: 2 } })
      const searchPayload = JSON.parse(searchResult.content[0].text)

      let fetchPayload = null
      if (Array.isArray(searchPayload.hits) && searchPayload.hits.length > 0) {
        const fetchResult = await client.callTool({
          name: 'fetch',
          arguments: { chunkId: searchPayload.hits[0].chunkId, includeNeighbors: true, neighborWindow: 1 },
        })
        fetchPayload = JSON.parse(fetchResult.content[0].text)
      }

      console.log(JSON.stringify({
        toolNames: tools.tools.map(tool => tool.name),
        searchTotal: searchPayload.total,
        firstHit: searchPayload.hits?.[0] || null,
        fetchedChunkId: fetchPayload?.chunkId || null,
        fetchedSourceId: fetchPayload?.sourceId || null,
      }))

      await client.close()
    `

    const output = execFileSync('node', ['--input-type=module', '-e', script], {
      cwd: MCP_DIR,
      encoding: 'utf-8',
    })

    const lines = output.trim().split('\n').filter(Boolean)
    const payload = JSON.parse(lines[lines.length - 1]) as Record<string, any>

    expect(payload.toolNames).toContain('search')
    expect(payload.toolNames).toContain('fetch')
    expect(payload.searchTotal).toBeGreaterThan(0)
    expect(payload.firstHit?.sourceId).toBe('src_ac8da09a7cfd')
    expect(payload.fetchedChunkId).toBeTruthy()
    expect(payload.fetchedSourceId).toBe('src_ac8da09a7cfd')
  }, 60_000)
})

describe('qa-agent end-to-end RAG conversation', () => {
  it('starts a real conversation and triggers knowledge-service search', async () => {
    const { replyBody } = await createSessionAndChat(
      gw,
      USER_SYS,
      AGENT_ID,
      '请基于知识库中《部署方案.pdf》第1页的内容，简洁说明部署架构和部署环境，并保留 citation 标记。',
    )

    expect(replyBody.length).toBeGreaterThan(0)

    const events = parseSseEvents(replyBody)
    const assistantText = collectAssistantTextFromSse(events)
    const toolNames = extractToolNames(events)

    expect(toolNames.some(name => name.includes('search'))).toBe(true)
    expect(assistantText.length).toBeGreaterThan(0)

    const lowerText = assistantText.toLowerCase()
    const hasRelevantContent = assistantText.includes('部署') ||
      assistantText.includes('架构') ||
      assistantText.includes('环境') ||
      assistantText.includes('数据盘') ||
      assistantText.includes('知识库') ||
      assistantText.includes('检索') ||
      lowerText.includes('euleros')
    expect(hasRelevantContent).toBe(true)
  }, 120_000)
})
