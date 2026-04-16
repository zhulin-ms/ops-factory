import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sleep, startJavaGateway, type GatewayHandle } from './helpers.js'

const AGENT_ID = 'qa-cli-agent'
const USER_ID = 'admin'
const PROJECT_ROOT = join(import.meta.dirname, '..')
const SECRETS_PATH = join(PROJECT_ROOT, 'gateway', 'agents', 'qa-cli-agent', 'config', 'secrets.yaml')

let gw: GatewayHandle

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

function makeUserMessage(text: string) {
  return {
    role: 'user',
    created: Math.floor(Date.now() / 1000),
    content: [{ type: 'text', text }],
    metadata: { userVisible: true, agentVisible: true },
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

  const replyRes = await handle.fetchAs(userId, `/agents/${agentId}/agent/reply`, {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      user_message: makeUserMessage(message),
    }),
  })
  expect(replyRes.ok).toBe(true)

  return {
    sessionId,
    replyBody: await replyRes.text(),
  }
}

function hasQaCliSecrets(): boolean {
  if (!existsSync(SECRETS_PATH)) return false
  const content = readFileSync(SECRETS_PATH, 'utf8')
  return /CUSTOM_OPSAGENTLLM_API_KEY:\s*\S+/.test(content)
}

beforeAll(async () => {
  gw = await startJavaGateway()
  await sleep(2_000)
}, 60_000)

afterAll(async () => {
  if (gw) await gw.stop()
}, 20_000)

describe('qa-cli-agent registration and tool wiring', () => {
  it('lists qa-cli-agent in the gateway registry', async () => {
    const res = await gw.fetchAs(USER_ID, '/agents')
    expect(res.ok).toBe(true)
    const data = await res.json()
    const qaCli = (data.agents as Array<Record<string, any>>).find(agent => agent.id === AGENT_ID)

    expect(qaCli).toBeDefined()
    expect(qaCli!.name).toBe('QA CLI Agent')
  })

  it('loads Knowledge-Cli tools on a real session', async () => {
    const startRes = await gw.fetchAs(USER_ID, `/agents/${AGENT_ID}/agent/start`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(startRes.ok).toBe(true)
    const session = await startRes.json()
    const sessionId = session.id as string

    const res = await gw.fetchAs(USER_ID, `/agents/${AGENT_ID}/agent/tools?session_id=${sessionId}`)
    expect(res.ok).toBe(true)
    const tools = await res.json() as Array<Record<string, any>>
    const names = tools.map(tool => tool.name as string)

    expect(names.some(name => name.includes('search_content'))).toBe(true)
    expect(names.some(name => name.includes('read_file'))).toBe(true)
    expect(names.some(name => name.includes('find_files'))).toBe(true)
  }, 60_000)
})

describe('qa-cli-agent end-to-end conversation', () => {
  it.skipIf(!hasQaCliSecrets())('answers from configured files and emits filecite markers', async () => {
    const { replyBody } = await createSessionAndChat(
      gw,
      USER_ID,
      AGENT_ID,
      '请告诉我，哪个文件里出现了“告警管理”这个标题？只回答文件和证据。',
    )

    expect(replyBody.length).toBeGreaterThan(0)

    const events = parseSseEvents(replyBody)
    const assistantText = collectAssistantTextFromSse(events)
    const toolNames = extractToolNames(events)

    expect(toolNames.some(name => name.includes('search_content'))).toBe(true)
    expect(toolNames.some(name => name.includes('read_file'))).toBe(true)
    expect(assistantText).toContain('告警管理')
    expect(assistantText).toContain('content.md')
    expect(assistantText).toContain('[[filecite:')
  }, 120_000)
})
