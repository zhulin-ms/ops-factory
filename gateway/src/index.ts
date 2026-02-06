import http from 'node:http'
import httpProxy from 'http-proxy'
import { loadGatewayConfig } from './config.js'
import { ProcessManager } from './process-manager.js'
import { listOutputFiles, serveFile } from './file-server.js'

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

    // GET /status — gateway health
    if (pathname === '/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('ok')
      return
    }

    // GET /agents — list agents
    if (pathname === '/agents' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ agents: manager.listAgents() }))
      return
    }

    // GET /agents/:id/files — list output files
    const fileListMatch = pathname.match(/^\/agents\/([^/]+)\/files\/?$/)
    if (fileListMatch && req.method === 'GET') {
      const agentId = fileListMatch[1]
      const workspacePath = manager.getWorkspacePathAbsolute(agentId)
      if (!workspacePath) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `Agent '${agentId}' not found` }))
        return
      }
      try {
        const files = await listOutputFiles(workspacePath)
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
      const workspacePath = manager.getWorkspacePathAbsolute(agentId)
      if (!workspacePath) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `Agent '${agentId}' not found` }))
        return
      }
      await serveFile(workspacePath, filePath, req, res)
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
