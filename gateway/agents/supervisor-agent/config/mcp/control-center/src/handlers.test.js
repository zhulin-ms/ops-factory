import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'

let routes = {}
let originalFetch
let originalConsoleError
let capturedLogs = []

function mockFetch(input, init = {}) {
  const url = typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input.url)
  const path = url.pathname
  const method = (init.method || input.method || 'GET').toUpperCase()
  const key = `${method} ${path}`

  if (key in routes) {
    return Promise.resolve(new Response(JSON.stringify(routes[key]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
  }

  if (path in routes) {
    return Promise.resolve(new Response(JSON.stringify(routes[path]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
  }

  return Promise.resolve(new Response(`Not found: ${method} ${path}`, { status: 404 }))
}

beforeEach(() => {
  originalFetch = globalThis.fetch
  originalConsoleError = console.error
  globalThis.fetch = mockFetch
  routes = {}
  capturedLogs = []
  console.error = (message) => {
    capturedLogs.push(String(message))
  }
})

afterEach(() => {
  globalThis.fetch = originalFetch
  console.error = originalConsoleError
})

const {
  LOG_FILE_PATH,
  tools,
  dispatch,
  handleGetPlatformStatus,
  handleGetAgentsStatus,
  handleGetObservabilityData,
  handleGetRealtimeMetrics,
  handleListServices,
  handleGetServiceStatus,
  handleReadServiceLogs,
  handleReadServiceConfig,
  handleListEvents,
  handleStartService,
  handleStopService,
  handleRestartService,
  cc,
} = await import('./handlers.js')

describe('tool definitions', () => {
  it('should define 12 tools', () => {
    assert.equal(tools.length, 12)
    const names = tools.map(t => t.name)
    assert.deepStrictEqual(names, [
      'get_platform_status',
      'get_agents_status',
      'get_observability_data',
      'get_realtime_metrics',
      'list_services',
      'get_service_status',
      'read_service_logs',
      'read_service_config',
      'list_events',
      'start_service',
      'stop_service',
      'restart_service',
    ])
  })
})

describe('cc() helper', () => {
  it('should fetch and parse JSON', async () => {
    routes['/test'] = { ok: true }
    const result = await cc('/test')
    assert.deepStrictEqual(result, { ok: true })
  })

  it('should append query params', async () => {
    let capturedUrl
    globalThis.fetch = (input) => {
      const url = typeof input === 'string' ? new URL(input) : input instanceof URL ? input : new URL(input.url)
      capturedUrl = url
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
    }

    await cc('/test', { foo: 'bar', baz: '123' })
    assert.equal(capturedUrl.searchParams.get('foo'), 'bar')
    assert.equal(capturedUrl.searchParams.get('baz'), '123')
  })

  it('should send POST with JSON body', async () => {
    let capturedMethod
    globalThis.fetch = (_input, init = {}) => {
      capturedMethod = init.method
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
    }

    await cc('/test', undefined, { method: 'POST', body: JSON.stringify({ a: 1 }) })
    assert.equal(capturedMethod, 'POST')
  })

  it('should throw on non-ok response', async () => {
    await assert.rejects(
      () => cc('/missing'),
      (err) => {
        assert.ok(err.message.includes('404'))
        return true
      },
    )
  })

  it('should emit structured logs to stderr', async () => {
    routes['/test'] = { ok: true }
    await cc('/test')

    assert.ok(capturedLogs.length >= 2)
    const firstLog = JSON.parse(capturedLogs[0])
    assert.equal(firstLog.service, 'control_center')
    assert.equal(firstLog.event, 'control_center_request_started')
  })

  it('should use standardized MCP log file path', () => {
    assert.ok(LOG_FILE_PATH.endsWith('/logs/mcp/control_center.log'))
  })
})

describe('read-only handlers', () => {
  it('handleGetPlatformStatus should combine runtime system and instances', async () => {
    routes['/control-center/runtime/system'] = { gateway: { uptimeMs: 1000 } }
    routes['/control-center/runtime/instances'] = { totalInstances: 3 }

    const result = JSON.parse(await handleGetPlatformStatus())
    assert.deepStrictEqual(result.system, { gateway: { uptimeMs: 1000 } })
    assert.deepStrictEqual(result.instances, { totalInstances: 3 })
  })

  it('handleGetAgentsStatus should combine runtime agents and instances', async () => {
    routes['/control-center/runtime/agents'] = [{ id: 'agent-1' }]
    routes['/control-center/runtime/instances'] = { totalInstances: 1 }

    const result = JSON.parse(await handleGetAgentsStatus())
    assert.deepStrictEqual(result.agents, [{ id: 'agent-1' }])
    assert.deepStrictEqual(result.instances, { totalInstances: 1 })
  })

  it('handleGetObservabilityData should return unconfigured error', async () => {
    routes['/control-center/observability/status'] = { enabled: false }

    const result = JSON.parse(await handleGetObservabilityData(24))
    assert.ok(result.error.includes('not configured'))
    assert.equal(result.status.enabled, false)
  })

  it('handleGetObservabilityData should fetch observability payloads', async () => {
    routes['/control-center/observability/status'] = { enabled: true, reachable: true, host: 'http://langfuse:3000' }
    routes['/control-center/observability/overview'] = { totalTraces: 100 }
    routes['/control-center/observability/traces'] = [{ id: 'trace-1' }]
    routes['/control-center/observability/observations'] = { observations: [] }

    const result = JSON.parse(await handleGetObservabilityData(12))
    assert.equal(result.timeRange.hours, 12)
    assert.deepStrictEqual(result.overview, { totalTraces: 100 })
    assert.deepStrictEqual(result.traces, [{ id: 'trace-1' }])
    assert.deepStrictEqual(result.observations, { observations: [] })
  })

  it('handleGetRealtimeMetrics should return runtime metrics', async () => {
    routes['/control-center/runtime/metrics'] = { collectionIntervalSec: 30, series: [] }

    const result = JSON.parse(await handleGetRealtimeMetrics())
    assert.equal(result.collectionIntervalSec, 30)
  })

  it('handleListServices should return services', async () => {
    routes['/control-center/services'] = { services: [{ id: 'gateway' }] }
    const result = JSON.parse(await handleListServices())
    assert.deepStrictEqual(result.services, [{ id: 'gateway' }])
  })

  it('handleGetServiceStatus should require serviceId', async () => {
    routes['/control-center/services/gateway'] = { id: 'gateway', status: 'healthy' }
    const result = JSON.parse(await handleGetServiceStatus('gateway'))
    assert.equal(result.id, 'gateway')
  })

  it('handleReadServiceLogs should pass lines', async () => {
    routes['/control-center/services/gateway/logs'] = { content: 'line1\nline2' }
    const result = JSON.parse(await handleReadServiceLogs('gateway', 50))
    assert.equal(result.content, 'line1\nline2')
  })

  it('handleReadServiceConfig should return config payload', async () => {
    routes['/control-center/services/gateway/config'] = { content: 'server:\n  port: 3000' }
    const result = JSON.parse(await handleReadServiceConfig('gateway'))
    assert.ok(result.content.includes('port'))
  })

  it('handleListEvents should return events', async () => {
    routes['/control-center/events'] = { events: [{ type: 'action' }] }
    const result = JSON.parse(await handleListEvents())
    assert.deepStrictEqual(result.events, [{ type: 'action' }])
  })
})

describe('action handlers', () => {
  it('handleStartService should POST start action', async () => {
    routes['POST /control-center/services/gateway/actions/start'] = { success: true, action: 'start' }
    const result = JSON.parse(await handleStartService('gateway'))
    assert.equal(result.action, 'start')
  })

  it('handleStopService should POST stop action', async () => {
    routes['POST /control-center/services/gateway/actions/stop'] = { success: true, action: 'stop' }
    const result = JSON.parse(await handleStopService('gateway'))
    assert.equal(result.action, 'stop')
  })

  it('handleRestartService should POST restart action', async () => {
    routes['POST /control-center/services/gateway/actions/restart'] = { success: true, action: 'restart' }
    const result = JSON.parse(await handleRestartService('gateway'))
    assert.equal(result.action, 'restart')
  })
})

describe('dispatch', () => {
  it('should route get_platform_status', async () => {
    routes['/control-center/runtime/system'] = { up: true }
    routes['/control-center/runtime/instances'] = { total: 0 }

    const result = JSON.parse(await dispatch('get_platform_status', {}))
    assert.ok('system' in result)
    assert.ok('instances' in result)
  })

  it('should route list_services', async () => {
    routes['/control-center/services'] = { services: [] }
    const result = JSON.parse(await dispatch('list_services', {}))
    assert.ok('services' in result)
  })

  it('should route read_service_logs', async () => {
    routes['/control-center/services/gateway/logs'] = { content: '' }
    const result = JSON.parse(await dispatch('read_service_logs', { serviceId: 'gateway', lines: 10 }))
    assert.ok('content' in result)
  })

  it('should route restart_service', async () => {
    routes['POST /control-center/services/gateway/actions/restart'] = { action: 'restart' }
    const result = JSON.parse(await dispatch('restart_service', { serviceId: 'gateway' }))
    assert.equal(result.action, 'restart')
  })

  it('should reject missing serviceId on service-scoped tools', async () => {
    await assert.rejects(() => dispatch('get_service_status', {}), /serviceId is required/)
  })

  it('should throw on unknown tool', async () => {
    await assert.rejects(
      () => dispatch('unknown_tool', {}),
      (err) => {
        assert.ok(err.message.includes('Unknown tool'))
        return true
      },
    )
  })
})
