import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const GATEWAY_URL = process.env.GATEWAY_URL || 'https://127.0.0.1:3000'
const GATEWAY_SECRET_KEY = process.env.GATEWAY_SECRET_KEY || 'test'

// ---------------------------------------------------------------------------
// Gateway HTTP helper
// ---------------------------------------------------------------------------

async function gw<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${GATEWAY_URL}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  const res = await fetch(url, {
    headers: {
      'x-secret-key': GATEWAY_SECRET_KEY,
      'x-user-id': 'sys',
    },
    signal: AbortSignal.timeout(15_000),
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

const tools = [
  {
    name: 'get_platform_status',
    description:
      'Get platform health status: gateway uptime, host/port, running instances, Langfuse monitoring status, and idle timeout configuration.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_agents_status',
    description:
      'Get all agent configurations (provider, model, skills) and their running instance counts grouped by agent.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_observability_data',
    description:
      'Get observability metrics: KPIs (total traces, cost, avg/P95 latency, error count), daily trends, recent traces, and observation breakdown. Requires Langfuse to be configured.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        hours: {
          type: 'number',
          description: 'Time range in hours to query (default: 24)',
          minimum: 1,
          maximum: 720,
        },
      },
    },
  },
]

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleGetPlatformStatus(): Promise<string> {
  const [system, instances] = await Promise.all([
    gw<Record<string, unknown>>('/monitoring/system'),
    gw<Record<string, unknown>>('/monitoring/instances'),
  ])
  return JSON.stringify({ system, instances }, null, 2)
}

async function handleGetAgentsStatus(): Promise<string> {
  const [agentsRes, instances] = await Promise.all([
    gw<Record<string, unknown>>('/agents'),
    gw<Record<string, unknown>>('/monitoring/instances'),
  ])
  return JSON.stringify({ agents: agentsRes, instances }, null, 2)
}

async function handleGetObservabilityData(hours: number): Promise<string> {
  const to = new Date()
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000)
  const params = { from: from.toISOString(), to: to.toISOString() }

  // First check if Langfuse is available
  const status = await gw<{ enabled: boolean; reachable?: boolean; host?: string }>('/monitoring/status')
  if (!status.enabled) {
    return JSON.stringify({
      error: 'Langfuse is not configured. Observability data is unavailable.',
      status,
    }, null, 2)
  }
  if (!status.reachable) {
    return JSON.stringify({
      error: 'Langfuse is configured but not reachable.',
      status,
    }, null, 2)
  }

  const [overview, traces, observations] = await Promise.all([
    gw<Record<string, unknown>>('/monitoring/overview', params),
    gw<Record<string, unknown>>('/monitoring/traces', { ...params, limit: '30' }),
    gw<Record<string, unknown>>('/monitoring/observations', params),
  ])

  return JSON.stringify({ timeRange: { from: from.toISOString(), to: to.toISOString(), hours }, overview, traces, observations }, null, 2)
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  { name: 'platform-monitor', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  let result: string
  switch (name) {
    case 'get_platform_status':
      result = await handleGetPlatformStatus()
      break
    case 'get_agents_status':
      result = await handleGetAgentsStatus()
      break
    case 'get_observability_data': {
      const hours = (args as { hours?: number })?.hours ?? 24
      result = await handleGetObservabilityData(hours)
      break
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }

  return { content: [{ type: 'text', text: result }] }
})

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('[platform-monitor] MCP server running on stdio')
