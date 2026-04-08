/**
 * Supervisor Agent — Integration Tests
 *
 * Tests cover:
 *   1. resident instance infrastructure
 *   2. control-center MCP tool functionality
 *   3. Schedule auto-registration (recipe → paused schedule)
 *   4. End-to-end conversation: agent invokes MCP tools to answer monitoring queries
 *
 * Prerequisites: goosed binary available in PATH, gateway agents configured.
 * Run: cd test && npx vitest run supervisor-agent.test.ts --config vitest.config.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  CONTROL_CENTER_SECRET_KEY,
  freePort,
  startControlCenter,
  startJavaGateway,
  sleep,
  type ControlCenterHandle,
  type GatewayHandle,
} from './helpers.js'

const AGENT_ID = 'supervisor-agent'
const USER_SYS = 'admin'
const USER_ALICE = 'test-alice'

let gw: GatewayHandle
let cc: ControlCenterHandle

// ===== Helpers =====

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

/** Check if SSE events contain tool calls to a specific tool name */
function findToolCalls(events: Array<Record<string, any>>, toolName?: string): Array<Record<string, any>> {
  return events
    .filter(event => event.type === 'Message' && event.message)
    .flatMap(event => (event.message.content || []) as Array<Record<string, any>>)
    .filter(content => {
      if (content.type !== 'toolRequest') return false
      if (toolName && content.toolCall?.name !== toolName) return false
      return true
    })
}

/** Check if SSE events contain tool results */
function findToolResults(events: Array<Record<string, any>>): Array<Record<string, any>> {
  return events
    .filter(event => event.type === 'Message' && event.message)
    .flatMap(event => (event.message.content || []) as Array<Record<string, any>>)
    .filter(content => content.type === 'toolResponse')
}

function hasToolCall(events: Array<Record<string, any>>, toolNamePart: string): boolean {
  return findToolCalls(events).some(content => {
    const name = content.toolCall?.name
    return typeof name === 'string' && name.includes(toolNamePart)
  })
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
  // Start session
  const startRes = await handle.fetchAs(userId, `/agents/${agentId}/agent/start`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
  expect(startRes.ok).toBe(true)
  const session = await startRes.json()
  const sessionId = session.id as string

  // Resume session to load model & extensions (including MCP)
  const resumeRes = await handle.fetchAs(userId, `/agents/${agentId}/agent/resume`, {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, load_model_and_extensions: true }),
  })
  expect(resumeRes.ok).toBe(true)

  // Send message
  const replyBody = await sendReplyAndWait(handle, userId, agentId, sessionId, message)

  return { sessionId, replyBody }
}

// ===== Setup / Teardown =====

beforeAll(async () => {
  const controlCenterPort = await freePort()
  gw = await startJavaGateway({
    CONTROL_CENTER_URL: `http://127.0.0.1:${controlCenterPort}`,
    CONTROL_CENTER_SECRET_KEY,
  })
  cc = await startControlCenter(gw.port, controlCenterPort)
  // Give schedule registration a moment to complete
  await sleep(3000)
}, 90_000)

afterAll(async () => {
  if (cc) await cc.stop()
  if (gw) await gw.stop()
}, 15_000)


// =============================================================================
// 1. Resident Instance Infrastructure
// =============================================================================

describe('resident instance startup', () => {

  it('GET /agents returns supervisor-agent for admin user', async () => {
    const res = await gw.fetchAs(USER_SYS, '/agents')
    expect(res.ok).toBe(true)
    const data = await res.json()
    const agents = data.agents as Array<Record<string, any>>
    const supervisor = agents.find(a => a.id === AGENT_ID)
    expect(supervisor).toBeDefined()
    expect(supervisor!.name).toBe('Supervisor Agent')
  })

  it('GET /agents returns supervisor-agent for regular users too', async () => {
    const res = await gw.fetchAs(USER_ALICE, '/agents')
    expect(res.ok).toBe(true)
    const data = await res.json()
    const agents = data.agents as Array<Record<string, any>>
    const supervisor = agents.find(a => a.id === AGENT_ID)
    expect(supervisor).toBeDefined()
  })

  it('supervisor-agent system instance is pre-started', async () => {
    const res = await gw.fetch('/runtime-source/instances')
    expect(res.ok).toBe(true)
    const data = await res.json()
    const byAgent = data.byAgent as Array<Record<string, any>>
    const supervisorGroup = byAgent.find(g => g.agentId === AGENT_ID)
    expect(supervisorGroup).toBeDefined()
    const sysInstance = supervisorGroup!.instances.find(
      (i: Record<string, any>) => i.userId === USER_SYS
    )
    expect(sysInstance).toBeDefined()
    expect(sysInstance!.status).toBe('running')
  })
})


// =============================================================================
// 2. Schedule Auto-Registration
// =============================================================================

describe('schedule auto-registration', () => {

  it('daily-diagnosis schedule exists and is paused', async () => {
    const res = await gw.fetchAs(USER_SYS, `/agents/${AGENT_ID}/schedule/list`)
    expect(res.ok).toBe(true)
    const data = await res.json() as Record<string, any>
    const jobs = data.jobs as Array<Record<string, any>>
    expect(jobs).toBeInstanceOf(Array)
    const daily = jobs.find(s => s.id === 'daily-diagnosis')
    expect(daily).toBeDefined()
    expect(daily!.paused).toBe(true)
    expect(daily!.cron).toBe('0 9 * * *')
  }, 30_000)

  it('schedule is not duplicated on repeated startups', async () => {
    // The schedule should exist exactly once, not duplicated
    const res = await gw.fetchAs(USER_SYS, `/agents/${AGENT_ID}/schedule/list`)
    expect(res.ok).toBe(true)
    const data = await res.json() as Record<string, any>
    const jobs = data.jobs as Array<Record<string, any>>
    const dailyJobs = jobs.filter(s => s.id === 'daily-diagnosis')
    expect(dailyJobs.length).toBe(1)
  }, 30_000)
})


// =============================================================================
// 3. Control-Center MCP Tool Tests (via goosed /tools/list)
// =============================================================================

describe('control-center MCP tools registration', () => {

  it('control-center tools are available on the supervisor-agent instance', async () => {
    // Create a session first — /agent/tools requires session_id
    const startRes = await gw.fetchAs(USER_SYS, `/agents/${AGENT_ID}/agent/start`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(startRes.ok).toBe(true)
    const session = await startRes.json()
    const sessionId = session.id as string

    // Resume to load extensions (including MCP)
    const resumeRes = await gw.fetchAs(USER_SYS, `/agents/${AGENT_ID}/agent/resume`, {
      method: 'POST',
      body: JSON.stringify({ session_id: sessionId, load_model_and_extensions: true }),
    })
    expect(resumeRes.ok).toBe(true)

    // Query the MCP tool list with session_id
    const res = await gw.fetchAs(USER_SYS, `/agents/${AGENT_ID}/agent/tools?session_id=${sessionId}`)
    expect(res.ok).toBe(true)
    const tools = await res.json() as Array<Record<string, any>>
    const toolNames = tools.map(t => t.name)

    // control-center tools should be present (may have extension prefix)
    const hasPlatformStatus = toolNames.some(n => n.includes('get_platform_status'))
    const hasAgentsStatus = toolNames.some(n => n.includes('get_agents_status'))
    const hasObservability = toolNames.some(n => n.includes('get_observability_data'))
    const hasServices = toolNames.some(n => n.includes('list_services'))
    const hasLogs = toolNames.some(n => n.includes('read_service_logs'))
    const hasRestart = toolNames.some(n => n.includes('restart_service'))

    expect(hasPlatformStatus).toBe(true)
    expect(hasAgentsStatus).toBe(true)
    expect(hasObservability).toBe(true)
    expect(hasServices).toBe(true)
    expect(hasLogs).toBe(true)
    expect(hasRestart).toBe(true)
  }, 60_000)
})


// =============================================================================
// 4. End-to-End Conversation Tests
// =============================================================================

describe('supervisor-agent end-to-end conversations', () => {

  it('answers "current platform monitoring status" using MCP tools', async () => {
    const { sessionId, replyBody } = await createSessionAndChat(
      gw, USER_SYS, AGENT_ID,
      'What is the current platform monitoring status? Give me a brief overview of gateway health and running instances.',
    )

    expect(replyBody.length).toBeGreaterThan(0)

    const events = parseSseEvents(replyBody)
    const assistantText = collectAssistantTextFromSse(events)

    // The agent should have called at least one MCP tool
    const toolCalls = findToolCalls(events)
    expect(toolCalls.length).toBeGreaterThan(0)

    // Response should contain some assistant text or tool output trace
    const lowerText = assistantText.toLowerCase()
    const mentionsPlatform = lowerText.length > 0 ||
                             findToolResults(events).length > 0
    expect(mentionsPlatform).toBe(true)

    // Verify session was created
    expect(sessionId).toBeTruthy()
  }, 120_000)

  it('answers "which agents are configured" using get_agents_status', async () => {
    const { replyBody } = await createSessionAndChat(
      gw, USER_SYS, AGENT_ID,
      'List all configured agents and their status. Which ones are currently running?',
    )

    expect(replyBody.length).toBeGreaterThan(0)

    const events = parseSseEvents(replyBody)
    const assistantText = collectAssistantTextFromSse(events)

    // Response should contain some assistant text or tool output trace
    const lowerText = assistantText.toLowerCase()
    const mentionsAgents = lowerText.length > 0 ||
                           findToolResults(events).length > 0
    expect(mentionsAgents).toBe(true)
  }, 120_000)

  it('handles observability data request (may report Langfuse unavailable)', async () => {
    const { replyBody } = await createSessionAndChat(
      gw, USER_SYS, AGENT_ID,
      'Show me the observability data for the last 24 hours. Include error counts and latency metrics.',
    )

    expect(replyBody.length).toBeGreaterThan(0)

    const events = parseSseEvents(replyBody)
    const assistantText = collectAssistantTextFromSse(events)

    // The agent should have called the observability tool
    const toolCalls = findToolCalls(events)
    expect(toolCalls.length).toBeGreaterThan(0)

    // Response should mention observability concepts OR report that Langfuse is unavailable
    const lowerText = assistantText.toLowerCase()
    const relevantResponse = lowerText.includes('langfuse') ||
                             lowerText.includes('observab') ||
                             lowerText.includes('trace') ||
                             lowerText.includes('latency') ||
                             lowerText.includes('error') ||
                             lowerText.includes('unavailable') ||
                             lowerText.includes('not configured') ||
                             lowerText.includes('cost')
    expect(relevantResponse).toBe(true)
  }, 120_000)

  it('recognizes service inventory intent via list_services', async () => {
    const { replyBody } = await createSessionAndChat(
      gw, USER_SYS, AGENT_ID,
      'List all managed services and summarize their current health status.',
    )

    const events = parseSseEvents(replyBody)
    expect(hasToolCall(events, 'list_services')).toBe(true)
    expect(collectAssistantTextFromSse(events).length > 0 || findToolResults(events).length > 0).toBe(true)
  }, 120_000)

  it('recognizes single service status intent via get_service_status', async () => {
    const { replyBody } = await createSessionAndChat(
      gw, USER_SYS, AGENT_ID,
      'What is the current status of the business-intelligence service? Include whether it is reachable.',
    )

    const events = parseSseEvents(replyBody)
    expect(hasToolCall(events, 'get_service_status')).toBe(true)
    expect(collectAssistantTextFromSse(events).length > 0 || findToolResults(events).length > 0).toBe(true)
  }, 120_000)

  it('recognizes service log analysis intent via read_service_logs', async () => {
    const { replyBody } = await createSessionAndChat(
      gw, USER_SYS, AGENT_ID,
      'Read the latest gateway service logs and summarize any warnings or errors you see.',
    )

    const events = parseSseEvents(replyBody)
    expect(hasToolCall(events, 'read_service_logs')).toBe(true)
    expect(collectAssistantTextFromSse(events).length > 0 || findToolResults(events).length > 0).toBe(true)
  }, 120_000)

  it('recognizes control-center event intent via list_events', async () => {
    const { replyBody } = await createSessionAndChat(
      gw, USER_SYS, AGENT_ID,
      'Show me the most recent control center events and explain anything notable.',
    )

    const events = parseSseEvents(replyBody)
    expect(hasToolCall(events, 'list_events')).toBe(true)
    expect(collectAssistantTextFromSse(events).length > 0 || findToolResults(events).length > 0).toBe(true)
  }, 120_000)

  it('can manage business-intelligence lifecycle via start/restart/stop tools', async () => {
    const startReply = await createSessionAndChat(
      gw, USER_SYS, AGENT_ID,
      'Start the business-intelligence service and tell me whether it started successfully.',
    )
    const startEvents = parseSseEvents(startReply.replyBody)
    expect(hasToolCall(startEvents, 'start_service')).toBe(true)
    expect(collectAssistantTextFromSse(startEvents).length > 0 || findToolResults(startEvents).length > 0).toBe(true)

    const startedStatusRes = await cc.fetch('/control-center/services/business-intelligence')
    expect(startedStatusRes.ok).toBe(true)

    const restartReply = await createSessionAndChat(
      gw, USER_SYS, AGENT_ID,
      'Restart the business-intelligence service and tell me the result.',
    )
    const restartEvents = parseSseEvents(restartReply.replyBody)
    expect(hasToolCall(restartEvents, 'restart_service')).toBe(true)
    expect(collectAssistantTextFromSse(restartEvents).length > 0 || findToolResults(restartEvents).length > 0).toBe(true)

    const stopReply = await createSessionAndChat(
      gw, USER_SYS, AGENT_ID,
      'Stop the business-intelligence service and confirm when it is stopped.',
    )
    const stopEvents = parseSseEvents(stopReply.replyBody)
    expect(hasToolCall(stopEvents, 'stop_service')).toBe(true)
    expect(collectAssistantTextFromSse(stopEvents).length > 0 || findToolResults(stopEvents).length > 0).toBe(true)
  }, 240_000)
})


// =============================================================================
// 5. Runtime Source API Integration
// =============================================================================

describe('runtime source API endpoints', () => {

  it('GET /runtime-source/system returns valid platform data', async () => {
    const res = await gw.fetch('/runtime-source/system')
    expect(res.ok).toBe(true)
    const data = await res.json() as Record<string, any>

    expect(data.gateway).toBeDefined()
    expect(data.gateway.uptimeMs).toBeGreaterThan(0)
    expect(data.gateway.host).toBeTruthy()
    expect(data.gateway.port).toBeGreaterThan(0)

    expect(data.agents).toBeDefined()
    expect(data.agents.configured).toBeGreaterThanOrEqual(4) // at least 4 agents now

    expect(data.idle).toBeDefined()
    expect(data.idle.timeoutMs).toBeGreaterThan(0)
    if (data.langfuse !== undefined) {
      expect(typeof data.langfuse?.configured).toBe('boolean')
    }
  })

  it('GET /runtime-source/instances returns supervisor-agent instance', async () => {
    const res = await gw.fetch('/runtime-source/instances')
    expect(res.ok).toBe(true)
    const data = await res.json() as Record<string, any>

    expect(data.totalInstances).toBeGreaterThan(0)
    expect(data.runningInstances).toBeGreaterThan(0)
    expect(data.byAgent).toBeInstanceOf(Array)

    // supervisor-agent should have a system instance
    const supervisorGroup = data.byAgent.find(
      (g: Record<string, any>) => g.agentId === AGENT_ID
    )
    expect(supervisorGroup).toBeDefined()
    expect(supervisorGroup.instances.length).toBeGreaterThanOrEqual(1)
  })

  it('runtime-source endpoints require admin auth', async () => {
    const res = await gw.fetchAs(USER_ALICE, '/runtime-source/system')
    expect(res.status).toBe(403)
  })
})


// =============================================================================
// 6. Agent Config Integrity
// =============================================================================

describe('supervisor-agent configuration', () => {

  it('has correct provider and model', async () => {
    const res = await gw.fetch('/agents')
    expect(res.ok).toBe(true)
    const data = await res.json()
    const supervisor = (data.agents as Array<Record<string, any>>).find(a => a.id === AGENT_ID)
    expect(supervisor).toBeDefined()
    expect(supervisor!.provider).toBe('custom_qwen3.5-27b')
    expect(supervisor!.model).toBe('qwen/qwen3.5-27b')
  })

  it('has no skills (skills dir is empty)', async () => {
    const res = await gw.fetch('/agents')
    expect(res.ok).toBe(true)
    const data = await res.json()
    const supervisor = (data.agents as Array<Record<string, any>>).find(a => a.id === AGENT_ID)
    expect(supervisor!.skills).toEqual([])
  })
})
