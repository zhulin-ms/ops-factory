import { LOG_FILE_PATH, logError, logInfo } from './logger.js'

const CONTROL_CENTER_URL = process.env.CONTROL_CENTER_URL || 'http://127.0.0.1:8094'
const CONTROL_CENTER_SECRET_KEY = process.env.CONTROL_CENTER_SECRET_KEY || 'change-me'
const REQUEST_TIMEOUT_MS = 15_000

export { LOG_FILE_PATH }

export async function cc(path, params, init = {}) {
  const startedAt = Date.now()
  const url = new URL(`${CONTROL_CENTER_URL}${path}`)

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }
  }

  const method = init.method || 'GET'
  logInfo('control_center_request_started', {
    method,
    path,
    url: url.toString(),
    params,
  })

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'x-secret-key': CONTROL_CENTER_SECRET_KEY,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const error = new Error(`Control Center ${path} returned ${res.status}: ${text}`)
      logError('control_center_request_failed', {
        method,
        path,
        status: res.status,
        durationMs: Date.now() - startedAt,
        responseText: text,
        error,
      })
      throw error
    }

    const data = await res.json()
    logInfo('control_center_request_succeeded', {
      method,
      path,
      status: res.status,
      durationMs: Date.now() - startedAt,
    })
    return data
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith(`Control Center ${path} returned`))) {
      logError('control_center_request_exception', {
        method,
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
      'Get platform runtime status: gateway uptime, host/port, running instances, Langfuse status, and idle timeout configuration.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_agents_status',
    description:
      'Get configured agents (provider, model, skills) and their running instance counts grouped by agent.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_observability_data',
    description:
      'Get observability metrics from Control Center: KPIs, traces, latency, errors, and observation breakdown. Accepts optional hours.',
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
      'Get real-time gateway performance metrics from Control Center runtime metrics.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_services',
    description:
      'List all managed services from Control Center with their health and reachability status.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_service_status',
    description:
      'Get detailed status for one managed service by serviceId.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'Managed service id such as gateway, knowledge-service, or business-intelligence.',
        },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'read_service_logs',
    description:
      'Read the latest lines from a managed service log file.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'Managed service id such as gateway, knowledge-service, or business-intelligence.',
        },
        lines: {
          type: 'number',
          description: 'Number of trailing log lines to read (default: 200, max: 1000).',
          minimum: 1,
          maximum: 1000,
        },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'read_service_config',
    description:
      'Read the current config file content for a managed service.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'Managed service id such as gateway, knowledge-service, or business-intelligence.',
        },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'list_events',
    description:
      'List recent Control Center service events such as actions and health transitions.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'start_service',
    description:
      'Start a managed service through Control Center.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'Managed service id such as gateway, knowledge-service, or business-intelligence.',
        },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'stop_service',
    description:
      'Stop a managed service through Control Center.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'Managed service id such as gateway, knowledge-service, or business-intelligence.',
        },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'restart_service',
    description:
      'Restart a managed service through Control Center.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'Managed service id such as gateway, knowledge-service, or business-intelligence.',
        },
      },
      required: ['serviceId'],
    },
  },
]

function normalizeHours(rawHours) {
  if (typeof rawHours !== 'number' || !Number.isFinite(rawHours)) return 24
  return Math.min(720, Math.max(1, rawHours))
}

function normalizeLines(rawLines) {
  if (typeof rawLines !== 'number' || !Number.isFinite(rawLines)) return 200
  return Math.min(1000, Math.max(1, Math.round(rawLines)))
}

function requireServiceId(args) {
  const serviceId = typeof args?.serviceId === 'string' ? args.serviceId.trim() : ''
  if (!serviceId) {
    throw new Error('serviceId is required')
  }
  return serviceId
}

export async function handleGetPlatformStatus() {
  const [system, instances] = await Promise.all([
    cc('/control-center/runtime/system'),
    cc('/control-center/runtime/instances'),
  ])

  return JSON.stringify({ system, instances }, null, 2)
}

export async function handleGetAgentsStatus() {
  const [agentsRes, instances] = await Promise.all([
    cc('/control-center/runtime/agents'),
    cc('/control-center/runtime/instances'),
  ])

  return JSON.stringify({ agents: agentsRes, instances }, null, 2)
}

export async function handleGetObservabilityData(hours) {
  const to = new Date()
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000)
  const params = { from: from.toISOString(), to: to.toISOString() }

  const status = await cc('/control-center/observability/status')
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
    cc('/control-center/observability/overview', params),
    cc('/control-center/observability/traces', { ...params, limit: '30' }),
    cc('/control-center/observability/observations', params),
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
  const metrics = await cc('/control-center/runtime/metrics')
  return JSON.stringify(metrics, null, 2)
}

export async function handleListServices() {
  const services = await cc('/control-center/services')
  return JSON.stringify(services, null, 2)
}

export async function handleGetServiceStatus(serviceId) {
  const status = await cc(`/control-center/services/${encodeURIComponent(serviceId)}`)
  return JSON.stringify(status, null, 2)
}

export async function handleReadServiceLogs(serviceId, lines) {
  const logs = await cc(`/control-center/services/${encodeURIComponent(serviceId)}/logs`, { lines })
  return JSON.stringify(logs, null, 2)
}

export async function handleReadServiceConfig(serviceId) {
  const config = await cc(`/control-center/services/${encodeURIComponent(serviceId)}/config`)
  return JSON.stringify(config, null, 2)
}

export async function handleListEvents() {
  const events = await cc('/control-center/events')
  return JSON.stringify(events, null, 2)
}

export async function handleStartService(serviceId) {
  const result = await cc(`/control-center/services/${encodeURIComponent(serviceId)}/actions/start`, undefined, { method: 'POST' })
  return JSON.stringify(result, null, 2)
}

export async function handleStopService(serviceId) {
  const result = await cc(`/control-center/services/${encodeURIComponent(serviceId)}/actions/stop`, undefined, { method: 'POST' })
  return JSON.stringify(result, null, 2)
}

export async function handleRestartService(serviceId) {
  const result = await cc(`/control-center/services/${encodeURIComponent(serviceId)}/actions/restart`, undefined, { method: 'POST' })
  return JSON.stringify(result, null, 2)
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
      case 'list_services':
        result = await handleListServices()
        break
      case 'get_service_status':
        result = await handleGetServiceStatus(requireServiceId(args))
        break
      case 'read_service_logs':
        result = await handleReadServiceLogs(requireServiceId(args), normalizeLines(args.lines))
        break
      case 'read_service_config':
        result = await handleReadServiceConfig(requireServiceId(args))
        break
      case 'list_events':
        result = await handleListEvents()
        break
      case 'start_service':
        result = await handleStartService(requireServiceId(args))
        break
      case 'stop_service':
        result = await handleStopService(requireServiceId(args))
        break
      case 'restart_service':
        result = await handleRestartService(requireServiceId(args))
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
