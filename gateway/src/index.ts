import http from 'node:http'
import httpProxy from 'http-proxy'
import { loadGatewayConfig } from './config.js'
import { ProcessManager } from './process-manager.js'
import { listOutputFiles, serveFile } from './file-server.js'

type JsonRecord = Record<string, unknown>

interface AgentSession extends JsonRecord {
  id: string
  updated_at?: string
  agentId: string
}

interface SessionProbeResult {
  agentId: string
  session: JsonRecord
}

async function main() {
  const config = loadGatewayConfig()
  const manager = new ProcessManager(config)

  console.log(`Gateway starting — ${config.agents.length} agent(s) configured`)
  await manager.startAll()

  const proxy = httpProxy.createProxyServer({
    // Increase timeout for SSE streaming (5 minutes)
    proxyTimeout: 5 * 60 * 1000,
    timeout: 5 * 60 * 1000,
  })

  proxy.on('error', (err, _req, res) => {
    console.error('Proxy error:', err.message)
    if (res instanceof http.ServerResponse && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Bad gateway' }))
    }
  })

  const server = http.createServer(async (req, res) => {
    const url = req.url || '/'

    // CORS headers must be set before auth check (browsers send OPTIONS without custom headers)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-secret-key')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // Auth check (header-based, with query param fallback for file routes)
    const headerKey = req.headers['x-secret-key']
    const urlObj = new URL(url, `http://${req.headers.host || 'localhost'}`)
    const queryKey = urlObj.searchParams.get('key')
    const isFileRoute = urlObj.pathname.match(/^\/agents\/[^/]+\/files(\/|$)/)
    const isAuthed = headerKey === config.secretKey || (isFileRoute && queryKey === config.secretKey)

    if (!isAuthed) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }

    const pathname = urlObj.pathname
    const upstreamHeaders = {
      'x-secret-key': config.secretKey,
      'Content-Type': 'application/json',
    }

    const runningAgentIds = () =>
      manager
        .listAgents()
        .filter(agent => agent.status === 'running')
        .map(agent => agent.id)

    const getUpstreamTarget = (agentId: string): string | null => manager.getTarget(agentId)

    const fetchJsonFromAgent = async (agentId: string, path: string, method: 'GET' | 'DELETE' = 'GET') => {
      const target = getUpstreamTarget(agentId)
      if (!target) {
        return { ok: false as const, status: 503, error: 'Agent not running' }
      }

      try {
        const response = await fetch(`${target}${path}`, {
          method,
          headers: upstreamHeaders,
          signal: AbortSignal.timeout(5000),
        })

        const text = await response.text()
        const json = text ? (JSON.parse(text) as JsonRecord) : null
        return {
          ok: response.ok,
          status: response.status,
          json,
        }
      } catch (error) {
        return {
          ok: false as const,
          status: 502,
          error: error instanceof Error ? error.message : 'Unknown upstream error',
        }
      }
    }

    const parseSessions = (agentId: string, payload: JsonRecord | null): AgentSession[] => {
      const raw = payload?.sessions
      if (!Array.isArray(raw)) return []
      return raw
        .filter((item): item is JsonRecord => typeof item === 'object' && item !== null)
        .filter((item): item is JsonRecord & { id: string } => typeof item.id === 'string')
        .map(item => ({ ...item, agentId }))
    }

    const resolveSessionOwners = async (sessionId: string, preferredAgentId?: string): Promise<SessionProbeResult[]> => {
      const agentIds = preferredAgentId ? [preferredAgentId] : runningAgentIds()
      const probes = await Promise.all(agentIds.map(async agentId => {
        const result = await fetchJsonFromAgent(agentId, `/sessions/${encodeURIComponent(sessionId)}`)
        if (!result.ok) return null
        if (!result.json || typeof result.json !== 'object') return null
        return {
          agentId,
          session: result.json,
        } satisfies SessionProbeResult
      }))
      return probes.filter((probe): probe is SessionProbeResult => probe !== null)
    }

    // GET /status — gateway health
    if (pathname === '/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('ok')
      return
    }

    // GET /config — gateway configuration (office preview, etc.)
    if (pathname === '/config' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        officePreview: config.officePreview,
      }))
      return
    }

    // GET /agents — list agents
    if (pathname === '/agents' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ agents: manager.listAgents() }))
      return
    }

    // GET /sessions — aggregated sessions from all running agents
    if (pathname === '/sessions' && req.method === 'GET') {
      const agentIds = runningAgentIds()
      const settled = await Promise.all(agentIds.map(async agentId => {
        const result = await fetchJsonFromAgent(agentId, `/sessions${urlObj.search}`)
        if (!result.ok) {
          return {
            agentId,
            sessions: [] as AgentSession[],
            error: `HTTP ${result.status}`,
          }
        }
        return {
          agentId,
          sessions: parseSessions(agentId, result.json),
          error: null as string | null,
        }
      }))

      const sessions = settled
        .flatMap(item => item.sessions)
        .sort((a, b) => {
          const aTs = typeof a.updated_at === 'string' ? Date.parse(a.updated_at) : 0
          const bTs = typeof b.updated_at === 'string' ? Date.parse(b.updated_at) : 0
          return bTs - aTs
        })

      const partialFailures = settled
        .filter(item => item.error)
        .map(item => ({ agentId: item.agentId, error: item.error }))

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        sessions,
        partialFailures,
      }))
      return
    }

    // GET /sessions/:id — resolve session from one/many agents (query: ?agentId=xxx)
    const sessionReadMatch = pathname.match(/^\/sessions\/([^/]+)\/?$/)
    if (sessionReadMatch && req.method === 'GET') {
      const sessionId = decodeURIComponent(sessionReadMatch[1])
      const agentId = urlObj.searchParams.get('agentId') || undefined
      const owners = await resolveSessionOwners(sessionId, agentId)

      if (owners.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Session not found' }))
        return
      }

      if (!agentId && owners.length > 1) {
        res.writeHead(409, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          error: 'Session exists in multiple agents. Please provide agentId.',
          agentIds: owners.map(owner => owner.agentId),
        }))
        return
      }

      const owner = owners[0]
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ...owner.session, agentId: owner.agentId }))
      return
    }

    // DELETE /sessions/:id — delete from resolved owner (query: ?agentId=xxx)
    const sessionDeleteMatch = pathname.match(/^\/sessions\/([^/]+)\/?$/)
    if (sessionDeleteMatch && req.method === 'DELETE') {
      const sessionId = decodeURIComponent(sessionDeleteMatch[1])
      const agentId = urlObj.searchParams.get('agentId') || undefined
      const owners = await resolveSessionOwners(sessionId, agentId)

      if (owners.length === 0) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Session not found' }))
        return
      }

      if (!agentId && owners.length > 1) {
        res.writeHead(409, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          error: 'Session exists in multiple agents. Please provide agentId.',
          agentIds: owners.map(owner => owner.agentId),
        }))
        return
      }

      const owner = owners[0]
      const result = await fetchJsonFromAgent(owner.agentId, `/sessions/${encodeURIComponent(sessionId)}`, 'DELETE')

      if (!result.ok) {
        res.writeHead(result.status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          error: `Failed to delete session on agent '${owner.agentId}'`,
        }))
        return
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, agentId: owner.agentId }))
      return
    }

    // GET /agents/:id/files — list output files
    const fileListMatch = pathname.match(/^\/agents\/([^/]+)\/files\/?$/)
    if (fileListMatch && req.method === 'GET') {
      const agentId = fileListMatch[1]
      const artifactsPath = manager.getArtifactsPathAbsolute(agentId)
      if (!artifactsPath) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `Agent '${agentId}' not found` }))
        return
      }
      try {
        const files = await listOutputFiles(artifactsPath)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ files }))
      } catch (err) {
        console.error('File listing error:', err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Failed to list files' }))
      }
      return
    }

    // GET /agents/:id/files/* — serve/download a specific file
    const fileServeMatch = pathname.match(/^\/agents\/([^/]+)\/files\/(.+)$/)
    if (fileServeMatch && req.method === 'GET') {
      const agentId = fileServeMatch[1]
      const filePath = decodeURIComponent(fileServeMatch[2])
      const artifactsPath = manager.getArtifactsPathAbsolute(agentId)
      if (!artifactsPath) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `Agent '${agentId}' not found` }))
        return
      }
      await serveFile(artifactsPath, filePath, req, res)
      return
    }

    // GET/POST /agents/:id/mcp — proxy to goosed /config/extensions (hot reload MCP config)
    const mcpMatch = pathname.match(/^\/agents\/([^/]+)\/mcp\/?$/)
    if (mcpMatch && (req.method === 'GET' || req.method === 'POST')) {
      const agentId = mcpMatch[1]
      const target = manager.getTarget(agentId)

      if (!target) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `Agent '${agentId}' not found or not running` }))
        return
      }

      req.url = '/config/extensions'
      proxy.web(req, res, { target })
      return
    }

    // DELETE /agents/:id/mcp/:name — proxy to goosed /config/extensions/{name}
    const mcpDeleteMatch = pathname.match(/^\/agents\/([^/]+)\/mcp\/(.+)$/)
    if (mcpDeleteMatch && req.method === 'DELETE') {
      const agentId = mcpDeleteMatch[1]
      const mcpName = mcpDeleteMatch[2]
      const target = manager.getTarget(agentId)

      if (!target) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `Agent '${agentId}' not found or not running` }))
        return
      }

      req.url = `/config/extensions/${mcpName}`
      proxy.web(req, res, { target })
      return
    }

    // GET/PUT /agents/:id/config — agent configuration (port, AGENTS.md)
    const configMatch = pathname.match(/^\/agents\/([^/]+)\/config\/?$/)
    if (configMatch && (req.method === 'GET' || req.method === 'PUT')) {
      const agentId = configMatch[1]

      if (req.method === 'GET') {
        const agentConfig = manager.getAgentConfig(agentId)
        if (!agentConfig) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `Agent '${agentId}' not found` }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(agentConfig))
        return
      }

      if (req.method === 'PUT') {
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            const updates = JSON.parse(body)
            const result = manager.updateAgentConfig(agentId, updates)
            if (result.success) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(result))
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(result))
            }
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Invalid JSON body' }))
          }
        })
        return
      }
    }

    // GET /agents/:id/skills — detailed skills list
    const skillsMatch = pathname.match(/^\/agents\/([^/]+)\/skills\/?$/)
    if (skillsMatch && req.method === 'GET') {
      const agentId = skillsMatch[1]
      const skills = manager.getAgentSkillsDetailed(agentId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ skills }))
      return
    }

    // POST /agents/:id/validate-port — validate port availability
    const validatePortMatch = pathname.match(/^\/agents\/([^/]+)\/validate-port\/?$/)
    if (validatePortMatch && req.method === 'POST') {
      const agentId = validatePortMatch[1]
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', () => {
        try {
          const { port } = JSON.parse(body)
          if (typeof port !== 'number') {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Port must be a number' }))
            return
          }
          const result = manager.validatePort(port, agentId)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(result))
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid JSON body' }))
        }
      })
      return
    }

    // /agents/:id/* — proxy to goosed instance
    const match = pathname.match(/^\/agents\/([^/]+)(\/.*)?$/)
    if (match) {
      const agentId = match[1]
      const path = match[2] || '/'
      const target = manager.getTarget(agentId)

      if (!target) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `Agent '${agentId}' not found or not running` }))
        return
      }

      req.url = path
      proxy.web(req, res, { target })
      return
    }

    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found. Use /agents/:id/* to reach a goosed instance.' }))
  })

  const shutdown = async () => {
    console.log('\nGateway shutting down...')
    server.close()
    await manager.stopAll()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  server.listen(config.port, config.host, () => {
    console.log(`Gateway listening on http://${config.host}:${config.port}`)
    for (const a of manager.listAgents()) {
      console.log(`  ${a.status === 'running' ? '✓' : '✗'} ${a.id} — ${a.status}`)
    }
  })
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
