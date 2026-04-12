import { LOG_FILE_PATH, logError, logInfo } from './logger.js'

const GATEWAY_URL = process.env.GATEWAY_URL || 'https://127.0.0.1:3000'
const GATEWAY_SECRET_KEY = process.env.GATEWAY_SECRET_KEY || 'test'
const API_PREFIX = '/gateway'
const REQUEST_TIMEOUT_MS = 15_000

export { LOG_FILE_PATH }

export async function gw(path, params) {
  const startedAt = Date.now()
  const url = new URL(`${GATEWAY_URL}${path}`)

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
  }

  logInfo('gateway_request_started', {
    method: 'GET',
    path,
    url: url.toString(),
    params,
  })

  try {
    const res = await fetch(url, {
      headers: {
        'x-secret-key': GATEWAY_SECRET_KEY,
        'x-user-id': 'admin',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const error = new Error(`Gateway ${path} returned ${res.status}: ${text}`)
      logError('gateway_request_failed', {
        method: 'GET',
        path,
        status: res.status,
        durationMs: Date.now() - startedAt,
        responseText: text,
        error,
      })
      throw error
    }

    const data = await res.json()
    logInfo('gateway_request_succeeded', {
      method: 'GET',
      path,
      status: res.status,
      durationMs: Date.now() - startedAt,
    })
    return data
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith(`Gateway ${path} returned`))) {
      logError('gateway_request_exception', {
        method: 'GET',
        path,
        durationMs: Date.now() - startedAt,
        error,
      })
    }
    throw error
  }
}

export const tools = [
  {
    name: 'get_platform_status',
    description:
      'Get platform health status: gateway uptime, host/port, running instances, Langfuse monitoring status, and idle timeout configuration.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_agents_status',
    description:
      'Get all agent configurations (provider, model, skills) and their running instance counts grouped by agent.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_observability_data',
    description:
      'Get observability metrics: KPIs (total traces, cost, avg/P95 latency, error count), daily trends, recent traces, and observation breakdown. Requires Langfuse to be configured.',
    inputSchema: {
      type: 'object',
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
  {
    name: 'get_realtime_metrics',
    description:
      'Get real-time gateway performance metrics: current active instances/tokens/sessions, aggregate stats (request count, error count, avg/P95 latency, avg/P95 TTFT, tokens/sec), time series data (30s intervals, up to 120 slots = 1 hour), and per-agent breakdown. Does NOT require Langfuse.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
]

export async function handleGetPlatformStatus() {
  const [system, instances] = await Promise.all([
    gw(`${API_PREFIX}/monitoring/system`),
    gw(`${API_PREFIX}/monitoring/instances`),
  ])

  return JSON.stringify({ system, instances }, null, 2)
}

export async function handleGetAgentsStatus() {
  const [agentsRes, instances] = await Promise.all([
    gw(`${API_PREFIX}/agents`),
    gw(`${API_PREFIX}/monitoring/instances`),
  ])

  return JSON.stringify({ agents: agentsRes, instances }, null, 2)
}

export async function handleGetObservabilityData(hours) {
  const to = new Date()
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000)
  const params = { from: from.toISOString(), to: to.toISOString() }

  const status = await gw(`${API_PREFIX}/monitoring/status`)
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
    gw(`${API_PREFIX}/monitoring/overview`, params),
    gw(`${API_PREFIX}/monitoring/traces`, { ...params, limit: '30' }),
    gw(`${API_PREFIX}/monitoring/observations`, params),
  ])

  return JSON.stringify({
    timeRange: {
      from: from.toISOString(),
      to: to.toISOString(),
      hours,
    },
    overview,
    traces,
    observations,
  }, null, 2)
}

export async function handleGetRealtimeMetrics() {
  const metrics = await gw(`${API_PREFIX}/monitoring/metrics`)
  return JSON.stringify(metrics, null, 2)
}

function normalizeHours(rawHours) {
  if (typeof rawHours !== 'number' || !Number.isFinite(rawHours)) return 24
  return Math.min(720, Math.max(1, rawHours))
}

export async function dispatch(name, args = {}) {
  const startedAt = Date.now()
  logInfo('tool_dispatch_started', {
    tool: name,
    args,
  })

  try {
    let result

    switch (name) {
      case 'get_platform_status':
        result = await handleGetPlatformStatus()
        break
      case 'get_agents_status':
        result = await handleGetAgentsStatus()
        break
      case 'get_observability_data':
        result = await handleGetObservabilityData(normalizeHours(args.hours))
        break
      case 'get_realtime_metrics':
        result = await handleGetRealtimeMetrics()
        break
      default:
        throw new Error(`Unknown tool: ${name}`)
    }

    logInfo('tool_dispatch_succeeded', {
      tool: name,
      durationMs: Date.now() - startedAt,
    })
    return result
  } catch (error) {
    logError('tool_dispatch_failed', {
      tool: name,
      durationMs: Date.now() - startedAt,
      error,
    })
    throw error
  }
}
