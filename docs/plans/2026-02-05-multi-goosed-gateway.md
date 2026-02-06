# Multi-Goosed Gateway Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a lightweight Node.js gateway that manages multiple independent goosed processes (each with its own config.yaml and .goosehints), and update the frontend to dynamically route to any agent through the gateway.

**Architecture:** Gateway (port 3000) reads `agents/*/config.yaml`, spawns one goosed per agent on unique ports (3001+), and proxies frontend requests at `/agents/:id/*` to the corresponding goosed. Frontend fetches the agent registry from `GET /agents` and creates per-agent SDK clients via cached `getClient(agentId)`.

**Tech Stack:** Node.js 18+, TypeScript, http-proxy, yaml, tsx

---

## Environment Variables Reference

### Gateway (new)

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_HOST` | `127.0.0.1` | Gateway bind address |
| `GATEWAY_PORT` | `3000` | Gateway listen port |
| `GATEWAY_SECRET_KEY` | `test` | Frontend → gateway auth key |
| `GOOSED_BIN` | `goosed` | Path to goosed binary |

### Per-Agent (in config.yaml `env` section, consistent with goose crates)

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOSE_PORT` | auto-assigned (3001+) | Per config.yaml `port` field |
| `GOOSE_HOST` | `127.0.0.1` | Per config.yaml `host` field |
| `GOOSE_SERVER__SECRET_KEY` | inherits `GATEWAY_SECRET_KEY` | Internal auth |
| `GOOSE_PROVIDER` | (from goose global config) | LLM provider name |
| `GOOSE_MODEL` | (from goose global config) | Model name |
| `GOOSE_MODE` | `smart_approve` | Tool execution mode |
| `GOOSE_SYSTEM_PROMPT_FILE_PATH` | (none) | System prompt override |

`.goosehints` is placed in each agent directory and discovered automatically by goose's hint loader.

---

## Task 1: Create Agent Config Files

**Files:**
- Create: `agents/universal-agent/config.yaml`
- Create: `agents/universal-agent/.goosehints`
- Create: `agents/kb-agent/config.yaml`
- Create: `agents/kb-agent/.goosehints`
- Create: `agents/report-agent/config.yaml`
- Create: `agents/report-agent/.goosehints`

**Step 1: Create universal-agent config**

`agents/universal-agent/config.yaml`:
```yaml
id: universal-agent
name: "Universal Agent"
port: 3001
```

`agents/universal-agent/.goosehints`:
```
You are a general-purpose coding assistant.
```

**Step 2: Create kb-agent config**

`agents/kb-agent/config.yaml`:
```yaml
id: kb-agent
name: "KB Agent"
port: 3002
```

`agents/kb-agent/.goosehints`:
```
You are a knowledge base assistant.
```

**Step 3: Create report-agent config**

`agents/report-agent/config.yaml`:
```yaml
id: report-agent
name: "Report Agent"
port: 3003
```

`agents/report-agent/.goosehints`:
```
You are a report generation assistant.
```

**Step 4: Commit**

```bash
git add agents/
git commit -m "feat: add per-agent config.yaml and .goosehints files"
```

---

## Task 2: Gateway Server

**Files:**
- Create: `gateway/package.json`
- Create: `gateway/tsconfig.json`
- Create: `gateway/src/config.ts`
- Create: `gateway/src/process-manager.ts`
- Create: `gateway/src/index.ts`

**Step 1: Initialize gateway package**

`gateway/package.json`:
```json
{
  "name": "@ops-factory/gateway",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "http-proxy": "^1.18.1",
    "yaml": "^2.7.0"
  },
  "devDependencies": {
    "@types/http-proxy": "^1.17.16",
    "@types/node": "^22.13.1",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3"
  }
}
```

`gateway/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src"]
}
```

Run: `cd gateway && npm install`

**Step 2: Write config loader**

`gateway/src/config.ts`:
```typescript
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'

export interface AgentConfig {
  id: string
  name: string
  port: number
  host: string
  secret_key: string
  env?: Record<string, string>
}

export interface GatewayConfig {
  host: string
  port: number
  secretKey: string
  projectRoot: string
  agentsDir: string
  goosedBin: string
  agents: AgentConfig[]
}

export function loadGatewayConfig(): GatewayConfig {
  const host = process.env.GATEWAY_HOST || '127.0.0.1'
  const port = parseInt(process.env.GATEWAY_PORT || '3000', 10)
  const secretKey = process.env.GATEWAY_SECRET_KEY || 'test'
  const projectRoot = resolve(process.env.PROJECT_ROOT || process.cwd())
  const agentsDir = resolve(process.env.AGENTS_DIR || join(projectRoot, 'agents'))
  const goosedBin = process.env.GOOSED_BIN || 'goosed'

  const agents = loadAgentConfigs(agentsDir, host, secretKey, port)

  return { host, port, secretKey, projectRoot, agentsDir, goosedBin, agents }
}

function loadAgentConfigs(
  agentsDir: string,
  defaultHost: string,
  defaultSecretKey: string,
  gatewayPort: number,
): AgentConfig[] {
  if (!existsSync(agentsDir)) return []

  const entries = readdirSync(agentsDir, { withFileTypes: true })
  const agents: AgentConfig[] = []
  let nextPort = gatewayPort + 1

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue

    const configPath = join(agentsDir, entry.name, 'config.yaml')
    if (!existsSync(configPath)) continue

    const raw = readFileSync(configPath, 'utf-8')
    const parsed = parse(raw) as Record<string, unknown>

    const port = typeof parsed.port === 'number' ? parsed.port : nextPort++
    if (port >= nextPort) nextPort = port + 1

    agents.push({
      id: (parsed.id as string) || entry.name,
      name: (parsed.name as string) || entry.name,
      port,
      host: (parsed.host as string) || defaultHost,
      secret_key: (parsed.secret_key as string) || defaultSecretKey,
      env: (parsed.env as Record<string, string>) || undefined,
    })
  }

  return agents
}
```

**Step 3: Write process manager**

`gateway/src/process-manager.ts`:
```typescript
import { ChildProcess, spawn } from 'node:child_process'
import { join } from 'node:path'
import type { AgentConfig, GatewayConfig } from './config.js'

interface ManagedProcess {
  config: AgentConfig
  child: ChildProcess | null
  status: 'starting' | 'running' | 'stopped' | 'error'
}

export class ProcessManager {
  private processes = new Map<string, ManagedProcess>()
  private config: GatewayConfig

  constructor(config: GatewayConfig) {
    this.config = config
  }

  async startAll(): Promise<void> {
    const results = await Promise.allSettled(
      this.config.agents.map(agent => this.startAgent(agent))
    )
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error('Agent start failed:', r.reason)
      }
    }
  }

  private async startAgent(agent: AgentConfig): Promise<void> {
    console.log(`Starting ${agent.id} on port ${agent.port}...`)

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      GOOSE_PORT: String(agent.port),
      GOOSE_HOST: agent.host,
      GOOSE_SERVER__SECRET_KEY: agent.secret_key,
      ...(agent.env || {}),
    }

    const child = spawn(this.config.goosedBin, ['agent'], {
      env,
      cwd: this.config.projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const managed: ManagedProcess = { config: agent, child, status: 'starting' }
    this.processes.set(agent.id, managed)

    child.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim()
      if (line) console.log(`[${agent.id}] ${line}`)
    })

    child.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim()
      if (line) console.error(`[${agent.id}] ${line}`)
    })

    child.on('exit', (code) => {
      console.log(`[${agent.id}] exited with code ${code}`)
      managed.status = code === 0 ? 'stopped' : 'error'
      managed.child = null
    })

    await this.waitForReady(agent)
    managed.status = 'running'
    console.log(`[${agent.id}] ready on port ${agent.port}`)
  }

  private async waitForReady(agent: AgentConfig): Promise<void> {
    const url = `http://${agent.host}:${agent.port}/status`
    const maxAttempts = 30

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(url, {
          headers: { 'x-secret-key': agent.secret_key },
          signal: AbortSignal.timeout(2000),
        })
        if (res.ok) return
      } catch {
        // not ready yet
      }
      await new Promise(r => setTimeout(r, 500))
    }

    throw new Error(`${agent.id} failed to become ready on port ${agent.port}`)
  }

  getTarget(agentId: string): string | null {
    const m = this.processes.get(agentId)
    if (!m || m.status !== 'running') return null
    return `http://${m.config.host}:${m.config.port}`
  }

  listAgents(): Array<{ id: string; name: string; status: string }> {
    return Array.from(this.processes.values()).map(m => ({
      id: m.config.id,
      name: m.config.name,
      status: m.status,
    }))
  }

  async stopAll(): Promise<void> {
    for (const [, managed] of this.processes) {
      if (managed.child) {
        managed.child.kill('SIGTERM')
        managed.status = 'stopped'
      }
    }
    // Grace period
    await new Promise(r => setTimeout(r, 1000))
  }
}
```

**Step 4: Write gateway HTTP server**

`gateway/src/index.ts`:
```typescript
import http from 'node:http'
import httpProxy from 'http-proxy'
import { loadGatewayConfig } from './config.js'
import { ProcessManager } from './process-manager.js'

async function main() {
  const config = loadGatewayConfig()
  const manager = new ProcessManager(config)

  console.log(`Gateway starting — ${config.agents.length} agent(s) configured`)
  await manager.startAll()

  const proxy = httpProxy.createProxyServer({})

  proxy.on('error', (err, _req, res) => {
    console.error('Proxy error:', err.message)
    if (res instanceof http.ServerResponse && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Bad gateway' }))
    }
  })

  const server = http.createServer((req, res) => {
    const secretKey = req.headers['x-secret-key']
    if (secretKey !== config.secretKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Unauthorized' }))
      return
    }

    const url = req.url || '/'

    // CORS headers for browser requests
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-secret-key')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // GET /status — gateway health
    if (url === '/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('ok')
      return
    }

    // GET /agents — list agents
    if (url === '/agents' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ agents: manager.listAgents() }))
      return
    }

    // /agents/:id/* — proxy to goosed instance
    const match = url.match(/^\/agents\/([^/]+)(\/.*)?$/)
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
```

**Step 5: Install dependencies and verify build**

```bash
cd gateway && npm install && npx tsc --noEmit
```

**Step 6: Commit**

```bash
git add gateway/
git commit -m "feat: add gateway server for multi-goosed process management"
```

---

## Task 3: Update Startup / Shutdown Scripts

**Files:**
- Modify: `scripts/startup.sh`
- Modify: `scripts/shutdown.sh`

**Step 1: Update startup.sh**

Replace the entire content of `scripts/startup.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "${SCRIPT_DIR}")"
WEB_DIR="${ROOT_DIR}/web-app"
GATEWAY_DIR="${ROOT_DIR}/gateway"

# Configuration (all have defaults)
export GATEWAY_HOST="${GATEWAY_HOST:-127.0.0.1}"
export GATEWAY_PORT="${GATEWAY_PORT:-3000}"
export GATEWAY_SECRET_KEY="${GATEWAY_SECRET_KEY:-test}"
export GOOSED_BIN="${GOOSED_BIN:-goosed}"
export PROJECT_ROOT="${ROOT_DIR}"
VITE_PORT="${VITE_PORT:-5173}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Cleanup on exit
cleanup() {
    if [[ -n "${GATEWAY_PID:-}" ]] && kill -0 "${GATEWAY_PID}" 2>/dev/null; then
        log_info "Stopping gateway (PID: ${GATEWAY_PID})..."
        kill "${GATEWAY_PID}" 2>/dev/null || true
        wait "${GATEWAY_PID}" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

# 1. Shutdown existing services
log_info "Shutting down existing services..."
"${SCRIPT_DIR}/shutdown.sh"

# 2. Start gateway (which spawns all goosed instances)
log_info "Starting gateway at http://${GATEWAY_HOST}:${GATEWAY_PORT}"
cd "${GATEWAY_DIR}"
npx tsx src/index.ts &
GATEWAY_PID=$!

# Wait for gateway to be ready
sleep 5
if ! kill -0 "${GATEWAY_PID}" 2>/dev/null; then
    log_error "Failed to start gateway"
    exit 1
fi
log_info "Gateway started (PID: ${GATEWAY_PID})"

# 3. Start webapp
log_info "Starting webapp at http://${GATEWAY_HOST}:${VITE_PORT}"
cd "${WEB_DIR}"
npm run dev -- --host "${GATEWAY_HOST}"
```

**Step 2: Update shutdown.sh**

Replace the entire content of `scripts/shutdown.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

GATEWAY_PORT="${GATEWAY_PORT:-3000}"
VITE_PORT="${VITE_PORT:-5173}"

# Also check common goosed ports
GOOSED_PORTS="3001 3002 3003 3004 3005"

GREEN='\033[0;32m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }

stop_port() {
    local port=$1
    local name=$2
    if lsof -ti:"${port}" >/dev/null 2>&1; then
        log_info "Stopping ${name} on port ${port}..."
        kill $(lsof -ti:"${port}") 2>/dev/null || true
        sleep 1
    fi
}

stop_port "${VITE_PORT}" "webapp"
stop_port "${GATEWAY_PORT}" "gateway"
for port in ${GOOSED_PORTS}; do
    stop_port "${port}" "goosed"
done

log_info "All services stopped"
```

**Step 3: Commit**

```bash
git add scripts/
git commit -m "feat: update scripts for gateway-based multi-goosed startup"
```

---

## Task 4: Frontend — Context and AgentSelector

**Files:**
- Modify: `web-app/src/contexts/GoosedContext.tsx`
- Modify: `web-app/src/components/AgentSelector.tsx`
- Modify: `web-app/.env`
- Modify: `web-app/vite.config.ts`

**Step 1: Update .env**

Replace `web-app/.env`:
```
GATEWAY_URL=http://127.0.0.1:3000
GATEWAY_SECRET_KEY=test
```

**Step 2: Update vite.config.ts**

Replace the entire content of `web-app/vite.config.ts`:
```typescript
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '')

    const requiredEnvVars = ['GATEWAY_URL', 'GATEWAY_SECRET_KEY']
    const missingEnvVars = requiredEnvVars.filter(key => !env[key])

    if (missingEnvVars.length > 0) {
        console.error('\n Missing required environment variables:\n')
        missingEnvVars.forEach(key => console.error(`   - ${key}`))
        console.error('\n Please create a .env file in web-app/ with:\n')
        console.error('   GATEWAY_URL=http://127.0.0.1:3000')
        console.error('   GATEWAY_SECRET_KEY=test\n')
        process.exit(1)
    }

    return {
        plugins: [react()],
        define: {
            'import.meta.env.VITE_GATEWAY_URL': JSON.stringify(env.GATEWAY_URL),
            'import.meta.env.VITE_GATEWAY_SECRET_KEY': JSON.stringify(env.GATEWAY_SECRET_KEY),
        },
        server: {
            port: 5173,
        },
    }
})
```

**Step 3: Rewrite GoosedContext.tsx**

Replace the entire content of `web-app/src/contexts/GoosedContext.tsx`:
```typescript
import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react'
import { GoosedClient } from '@goosed/sdk'

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'http://127.0.0.1:3000'
const GATEWAY_SECRET_KEY = import.meta.env.VITE_GATEWAY_SECRET_KEY || 'test'

export interface AgentInfo {
    id: string
    name: string
    status: string
}

interface GoosedContextType {
    getClient: (agentId: string) => GoosedClient
    agents: AgentInfo[]
    isConnected: boolean
    error: string | null
    refreshAgents: () => Promise<void>
}

const GoosedContext = createContext<GoosedContextType | null>(null)

export function GoosedProvider({ children }: { children: ReactNode }) {
    const [agents, setAgents] = useState<AgentInfo[]>([])
    const [isConnected, setIsConnected] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const clientCache = useRef<Record<string, GoosedClient>>({})

    const getClient = useCallback((agentId: string): GoosedClient => {
        if (!clientCache.current[agentId]) {
            clientCache.current[agentId] = new GoosedClient({
                baseUrl: `${GATEWAY_URL}/agents/${agentId}`,
                secretKey: GATEWAY_SECRET_KEY,
                timeout: 30000,
            })
        }
        return clientCache.current[agentId]
    }, [])

    const fetchAgents = useCallback(async () => {
        try {
            const res = await fetch(`${GATEWAY_URL}/agents`, {
                headers: { 'x-secret-key': GATEWAY_SECRET_KEY },
                signal: AbortSignal.timeout(5000),
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json()
            setAgents(data.agents || [])
            setIsConnected(true)
            setError(null)
        } catch (err) {
            setIsConnected(false)
            setError(err instanceof Error ? err.message : 'Failed to connect to gateway')
        }
    }, [])

    useEffect(() => {
        fetchAgents()
        const interval = setInterval(fetchAgents, 30000)
        return () => clearInterval(interval)
    }, [fetchAgents])

    return (
        <GoosedContext.Provider value={{ getClient, agents, isConnected, error, refreshAgents: fetchAgents }}>
            {children}
        </GoosedContext.Provider>
    )
}

export function useGoosed(): GoosedContextType {
    const context = useContext(GoosedContext)
    if (!context) {
        throw new Error('useGoosed must be used within a GoosedProvider')
    }
    return context
}
```

**Step 4: Rewrite AgentSelector.tsx**

Replace the entire content of `web-app/src/components/AgentSelector.tsx`:
```typescript
import { useState, useRef, useEffect } from 'react'
import { useGoosed, AgentInfo } from '../contexts/GoosedContext'

interface AgentSelectorProps {
    selectedAgent: string
    onAgentChange: (agentId: string) => void
    disabled?: boolean
}

export function getAgentWorkingDir(agentId: string): string {
    return `agents/${agentId}`
}

export default function AgentSelector({
    selectedAgent,
    onAgentChange,
    disabled = false
}: AgentSelectorProps) {
    const { agents } = useGoosed()
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const selectedAgentInfo = agents.find(a => a.id === selectedAgent) || agents[0]

    return (
        <div className="agent-selector" ref={dropdownRef}>
            <button
                type="button"
                className="agent-selector-trigger"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    width="14"
                    height="14"
                    className="agent-icon"
                >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
                </svg>
                <span className="agent-name">{selectedAgentInfo?.name || selectedAgent}</span>
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    width="12"
                    height="12"
                    className={`chevron ${isOpen ? 'open' : ''}`}
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {isOpen && (
                <div className="agent-dropdown">
                    <div className="agent-dropdown-header">Agent</div>
                    {agents.map(agent => (
                        <button
                            key={agent.id}
                            type="button"
                            className={`agent-option ${agent.id === selectedAgent ? 'selected' : ''}`}
                            onClick={() => {
                                onAgentChange(agent.id)
                                setIsOpen(false)
                            }}
                            disabled={agent.status !== 'running'}
                        >
                            {agent.name}
                            {agent.status !== 'running' && (
                                <span style={{ fontSize: '0.75em', opacity: 0.6, marginLeft: '4px' }}>
                                    ({agent.status})
                                </span>
                            )}
                            {agent.id === selectedAgent && (
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    width="14"
                                    height="14"
                                    className="check-icon"
                                >
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
```

**Step 5: Commit**

```bash
git add web-app/src/contexts/ web-app/src/components/AgentSelector.tsx web-app/.env web-app/vite.config.ts
git commit -m "feat: frontend context and selector for gateway-based multi-agent"
```

---

## Task 5: Frontend — Pages and useChat Hook

**Files:**
- Modify: `web-app/src/hooks/useChat.ts`
- Modify: `web-app/src/pages/Home.tsx`
- Modify: `web-app/src/pages/Chat.tsx`

**Step 1: Update useChat to accept a client parameter**

Change the import and interface in `web-app/src/hooks/useChat.ts`:

Remove:
```typescript
import { useGoosed } from '../contexts/GoosedContext'
```

Change `UseChatOptions` interface:
```typescript
interface UseChatOptions {
    sessionId: string | null
    client: GoosedClient
}
```

Add import at top:
```typescript
import { GoosedClient } from '@goosed/sdk'
```

Change hook signature — remove the `useGoosed()` call:
```typescript
export function useChat({ sessionId, client }: UseChatOptions): UseChatReturn {
    // DELETE this line: const { client } = useGoosed()
```

Everything else in useChat stays the same.

**Step 2: Rewrite Home.tsx**

Replace the entire content of `web-app/src/pages/Home.tsx`:
```typescript
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoosed } from '../contexts/GoosedContext'
import ChatInput from '../components/ChatInput'
import SessionList from '../components/SessionList'
import { getAgentWorkingDir } from '../components/AgentSelector'
import type { Session } from '@goosed/sdk'

interface ModelInfo {
    provider: string
    model: string
}

interface AgentSession extends Session {
    agentId: string
}

export default function Home() {
    const navigate = useNavigate()
    const { getClient, agents, isConnected, error: connectionError } = useGoosed()
    const [recentSessions, setRecentSessions] = useState<AgentSession[]>([])
    const [isLoadingSessions, setIsLoadingSessions] = useState(true)
    const [isCreatingSession, setIsCreatingSession] = useState(false)
    const [selectedAgent, setSelectedAgent] = useState('')
    const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)

    // Set default agent when agents load
    useEffect(() => {
        if (agents.length > 0 && !selectedAgent) {
            setSelectedAgent(agents[0].id)
        }
    }, [agents, selectedAgent])

    // Fetch model info from first available agent
    useEffect(() => {
        const fetchModelInfo = async () => {
            if (!isConnected || !selectedAgent) return
            try {
                const client = getClient(selectedAgent)
                const systemInfo = await client.systemInfo()
                if (systemInfo.provider && systemInfo.model) {
                    setModelInfo({ provider: systemInfo.provider, model: systemInfo.model })
                }
            } catch (err) {
                console.error('Failed to fetch model info:', err)
            }
        }
        fetchModelInfo()
    }, [getClient, selectedAgent, isConnected])

    // Load recent sessions from all agents
    useEffect(() => {
        const loadSessions = async () => {
            if (!isConnected || agents.length === 0) return

            const allSessions: AgentSession[] = []
            for (const agent of agents) {
                try {
                    const client = getClient(agent.id)
                    const sessions = await client.listSessions()
                    allSessions.push(...sessions.map(s => ({ ...s, agentId: agent.id })))
                } catch {
                    // agent might not be running
                }
            }

            allSessions.sort((a, b) =>
                new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
            )
            setRecentSessions(allSessions.slice(0, 5))
            setIsLoadingSessions(false)
        }
        loadSessions()
    }, [getClient, agents, isConnected])

    const handleInputSubmit = async (message: string) => {
        if (isCreatingSession || !selectedAgent) return

        setIsCreatingSession(true)
        try {
            const client = getClient(selectedAgent)
            const workingDir = getAgentWorkingDir(selectedAgent)
            const session = await client.startSession(workingDir)
            await client.resumeSession(session.id)

            navigate(`/chat?sessionId=${session.id}&agent=${selectedAgent}`, {
                state: { initialMessage: message }
            })
        } catch (err) {
            console.error('Failed to create session:', err)
            alert('Failed to create session: ' + (err instanceof Error ? err.message : 'Unknown error'))
        } finally {
            setIsCreatingSession(false)
        }
    }

    const handleResumeSession = (sessionId: string) => {
        // Find which agent this session belongs to
        const session = recentSessions.find(s => s.id === sessionId)
        const agentId = session?.agentId || selectedAgent
        navigate(`/chat?sessionId=${sessionId}&agent=${agentId}`)
    }

    const handleDeleteSession = async (sessionId: string) => {
        const session = recentSessions.find(s => s.id === sessionId)
        if (!session) return
        try {
            const client = getClient(session.agentId)
            await client.deleteSession(sessionId)
            setRecentSessions(prev => prev.filter(s => s.id !== sessionId))
        } catch (err) {
            console.error('Failed to delete session:', err)
        }
    }

    return (
        <div className="home-container">
            <div className="home-hero">
                <h1 className="home-title">Hello, I'm Goose</h1>
                <p className="home-description">
                    Your AI-powered coding assistant. Ask me anything about your codebase,
                    let me help you write, debug, or explain code.
                </p>

                {connectionError && (
                    <div style={{
                        padding: 'var(--spacing-4)',
                        background: 'rgba(239, 68, 68, 0.2)',
                        borderRadius: 'var(--radius-lg)',
                        color: 'var(--color-error)',
                        marginBottom: 'var(--spacing-6)'
                    }}>
                        Connection error: {connectionError}
                    </div>
                )}

                {!isConnected && !connectionError && (
                    <div style={{
                        padding: 'var(--spacing-4)',
                        background: 'rgba(245, 158, 11, 0.2)',
                        borderRadius: 'var(--radius-lg)',
                        color: 'var(--color-warning)',
                        marginBottom: 'var(--spacing-6)'
                    }}>
                        Connecting to gateway...
                    </div>
                )}
            </div>

            <div className="home-input-container">
                <ChatInput
                    onSubmit={handleInputSubmit}
                    disabled={!isConnected || isCreatingSession || !selectedAgent}
                    placeholder={isCreatingSession ? "Creating session..." : "Ask me anything..."}
                    autoFocus
                    selectedAgent={selectedAgent}
                    onAgentChange={setSelectedAgent}
                    modelInfo={modelInfo}
                />
            </div>

            {recentSessions.length > 0 && (
                <div style={{
                    width: '100%',
                    maxWidth: '600px',
                    marginTop: 'var(--spacing-10)'
                }}>
                    <h3 style={{
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 600,
                        color: 'var(--color-text-secondary)',
                        marginBottom: 'var(--spacing-4)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                    }}>
                        Recent Chats
                    </h3>
                    <SessionList
                        sessions={recentSessions}
                        isLoading={isLoadingSessions}
                        onResume={handleResumeSession}
                        onDelete={handleDeleteSession}
                    />
                </div>
            )}
        </div>
    )
}
```

**Step 3: Rewrite Chat.tsx**

Replace the entire content of `web-app/src/pages/Chat.tsx`:
```typescript
import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import { useGoosed } from '../contexts/GoosedContext'
import { useChat, convertBackendMessage } from '../hooks/useChat'
import MessageList from '../components/MessageList'
import ChatInput from '../components/ChatInput'
import { getAgentWorkingDir } from '../components/AgentSelector'
import type { Session } from '@goosed/sdk'

interface LocationState {
    initialMessage?: string
}

interface ModelInfo {
    provider: string
    model: string
}

// Detect agent from session working_dir as fallback
function detectAgentFromWorkingDir(workingDir: string, agents: Array<{ id: string }>): string {
    for (const agent of agents) {
        if (workingDir.includes(agent.id)) {
            return agent.id
        }
    }
    return agents[0]?.id || ''
}

export default function Chat() {
    const [searchParams] = useSearchParams()
    const location = useLocation()
    const navigate = useNavigate()
    const { getClient, agents, isConnected } = useGoosed()

    const sessionId = searchParams.get('sessionId')
    const agentParam = searchParams.get('agent')

    const [selectedAgent, setSelectedAgent] = useState(agentParam || agents[0]?.id || '')
    const [session, setSession] = useState<Session | null>(null)
    const [isInitializing, setIsInitializing] = useState(true)
    const [initError, setInitError] = useState<string | null>(null)
    const [isCreatingSession, setIsCreatingSession] = useState(false)
    const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)

    // Get client for current agent
    const client = selectedAgent ? getClient(selectedAgent) : null

    const { messages, isLoading, error, sendMessage, clearMessages, setInitialMessages } = useChat({
        sessionId,
        client: client!,
    })

    // Set agent from URL param or agents list
    useEffect(() => {
        if (agentParam) {
            setSelectedAgent(agentParam)
        } else if (agents.length > 0 && !selectedAgent) {
            setSelectedAgent(agents[0].id)
        }
    }, [agentParam, agents, selectedAgent])

    const locationState = location.state as LocationState | null
    const initialMessage = locationState?.initialMessage

    // Fetch model info
    useEffect(() => {
        const fetchModelInfo = async () => {
            if (!isConnected || !client) return
            try {
                const systemInfo = await client.systemInfo()
                if (systemInfo.provider && systemInfo.model) {
                    setModelInfo({ provider: systemInfo.provider, model: systemInfo.model })
                }
            } catch (err) {
                console.error('Failed to fetch model info:', err)
            }
        }
        fetchModelInfo()
    }, [client, isConnected])

    // Create session with specified agent
    const createSessionWithAgent = useCallback(async (agentId: string) => {
        setIsCreatingSession(true)
        try {
            const agentClient = getClient(agentId)
            const workingDir = getAgentWorkingDir(agentId)
            const newSession = await agentClient.startSession(workingDir)
            await agentClient.resumeSession(newSession.id)
            setSession(newSession)
            setSelectedAgent(agentId)
            clearMessages()
            navigate(`/chat?sessionId=${newSession.id}&agent=${agentId}`, { replace: true })
            return newSession
        } catch (err) {
            console.error('Failed to create session:', err)
            setInitError(err instanceof Error ? err.message : 'Failed to create session')
            return null
        } finally {
            setIsCreatingSession(false)
        }
    }, [getClient, clearMessages, navigate])

    // Handle agent change
    const handleAgentChange = useCallback(async (agentId: string) => {
        if (agentId === selectedAgent) return
        await createSessionWithAgent(agentId)
    }, [selectedAgent, createSessionWithAgent])

    // Initialize session
    useEffect(() => {
        const initSession = async () => {
            if (!isConnected || !selectedAgent) return

            if (!sessionId) {
                setIsInitializing(true)
                await createSessionWithAgent(selectedAgent)
                setIsInitializing(false)
                return
            }

            setIsInitializing(true)
            setInitError(null)

            try {
                const agentClient = getClient(selectedAgent)
                const sessionDetails = await agentClient.getSession(sessionId)
                setSession(sessionDetails)

                // Detect agent from working directory if not in URL
                if (!agentParam && sessionDetails.working_dir) {
                    const detected = detectAgentFromWorkingDir(sessionDetails.working_dir, agents)
                    if (detected !== selectedAgent) {
                        setSelectedAgent(detected)
                    }
                }

                await agentClient.resumeSession(sessionId)

                if (sessionDetails.conversation && Array.isArray(sessionDetails.conversation)) {
                    const historyMessages = sessionDetails.conversation.map(msg =>
                        convertBackendMessage(msg as Record<string, unknown>)
                    )
                    setInitialMessages(historyMessages)
                }
            } catch (err) {
                console.error('Failed to initialize session:', err)
                setInitError(err instanceof Error ? err.message : 'Failed to load session')
            } finally {
                setIsInitializing(false)
            }
        }
        initSession()
    }, [getClient, isConnected, sessionId, selectedAgent, agentParam, agents, setInitialMessages, createSessionWithAgent])

    // Send initial message
    useEffect(() => {
        if (initialMessage && sessionId && !isInitializing && messages.length === 0) {
            sendMessage(initialMessage)
            window.history.replaceState({}, document.title)
        }
    }, [initialMessage, sessionId, isInitializing, messages.length, sendMessage])

    const handleSendMessage = useCallback((text: string) => {
        sendMessage(text)
    }, [sendMessage])

    if (isInitializing) {
        return (
            <div className="chat-container">
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div className="loading-spinner" style={{ margin: '0 auto var(--spacing-4)' }} />
                        <p style={{ color: 'var(--color-text-secondary)' }}>Loading session...</p>
                    </div>
                </div>
            </div>
        )
    }

    if (initError) {
        return (
            <div className="chat-container">
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="empty-state">
                        <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <h3 className="empty-state-title">Failed to load session</h3>
                        <p className="empty-state-description">{initError}</p>
                        <button className="btn btn-primary" style={{ marginTop: 'var(--spacing-4)' }} onClick={() => navigate('/')}>
                            Back to Home
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="chat-container">
            <header className="chat-header">
                <div>
                    <h1 className="chat-title">{session?.name || 'Chat'}</h1>
                    {session?.working_dir && (
                        <p style={{
                            fontSize: 'var(--font-size-xs)',
                            color: 'var(--color-text-muted)',
                            marginTop: 'var(--spacing-1)'
                        }}>
                            {session.working_dir}
                        </p>
                    )}
                </div>
            </header>

            <div className="chat-messages-wrapper">
                <div className="chat-messages-scroll">
                    <MessageList messages={messages} isLoading={isLoading} />
                </div>
                {error && (
                    <div style={{
                        padding: 'var(--spacing-3) var(--spacing-6)',
                        background: 'rgba(239, 68, 68, 0.1)',
                        borderTop: '1px solid rgba(239, 68, 68, 0.3)',
                        color: 'var(--color-error)',
                        fontSize: 'var(--font-size-sm)'
                    }}>
                        {error}
                    </div>
                )}
            </div>

            <div className="chat-input-area-sticky">
                <ChatInput
                    onSubmit={handleSendMessage}
                    disabled={isLoading || !isConnected || isCreatingSession}
                    placeholder={isCreatingSession ? "Switching agent..." : isLoading ? "Waiting for response..." : "Type a message..."}
                    autoFocus
                    selectedAgent={selectedAgent}
                    onAgentChange={handleAgentChange}
                    showAgentSelector={true}
                    modelInfo={modelInfo}
                />
            </div>
        </div>
    )
}
```

**Step 4: Commit**

```bash
git add web-app/src/
git commit -m "feat: update pages and useChat for multi-agent gateway routing"
```

---

## Task 6: Remove Dead Code and Update .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: Update .gitignore**

Add gateway build artifacts:
```
gateway/node_modules/
gateway/dist/
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: update gitignore for gateway"
```

---

## Task 7: Integration Verification

**Step 1: Build check**

```bash
cd gateway && npm install && npx tsc --noEmit
cd ../web-app && npm install && npx tsc --noEmit
```

**Step 2: Start services**

```bash
./scripts/startup.sh
```

Expected output:
```
[INFO] Shutting down existing services...
[INFO] Starting gateway at http://127.0.0.1:3000
Gateway starting — 3 agent(s) configured
Starting universal-agent on port 3001...
Starting kb-agent on port 3002...
Starting report-agent on port 3003...
[universal-agent] ready on port 3001
[kb-agent] ready on port 3002
[report-agent] ready on port 3003
Gateway listening on http://127.0.0.1:3000
  ✓ universal-agent — running
  ✓ kb-agent — running
  ✓ report-agent — running
[INFO] Starting webapp at http://127.0.0.1:5173
```

**Step 3: Verify gateway API**

```bash
curl -H "x-secret-key: test" http://127.0.0.1:3000/agents
curl -H "x-secret-key: test" http://127.0.0.1:3000/agents/universal-agent/status
```

**Step 4: Browser test**

Open http://127.0.0.1:5173 and verify:
1. Agent dropdown shows all 3 agents from gateway
2. Can create a session with each agent
3. Can send messages and get responses
4. Can switch agents (creates new session on different goosed)
5. Recent sessions show sessions from all agents

---

## Architecture Summary

```
Browser (5173)
  │
  └──▶ Gateway (3000)
         ├── GET /agents          → agent registry
         ├── GET /status          → gateway health
         ├── /agents/universal-agent/*  ──▶ goosed (3001)
         ├── /agents/kb-agent/*         ──▶ goosed (3002)
         └── /agents/report-agent/*     ──▶ goosed (3003)
                                             │
                                     agents/{id}/config.yaml
                                     agents/{id}/.goosehints
```

## File Change Summary

| Action | File |
|--------|------|
| Create | `agents/universal-agent/config.yaml` |
| Create | `agents/universal-agent/.goosehints` |
| Create | `agents/kb-agent/config.yaml` |
| Create | `agents/kb-agent/.goosehints` |
| Create | `agents/report-agent/config.yaml` |
| Create | `agents/report-agent/.goosehints` |
| Create | `gateway/package.json` |
| Create | `gateway/tsconfig.json` |
| Create | `gateway/src/config.ts` |
| Create | `gateway/src/process-manager.ts` |
| Create | `gateway/src/index.ts` |
| Modify | `scripts/startup.sh` |
| Modify | `scripts/shutdown.sh` |
| Modify | `web-app/.env` |
| Modify | `web-app/vite.config.ts` |
| Modify | `web-app/src/contexts/GoosedContext.tsx` |
| Modify | `web-app/src/components/AgentSelector.tsx` |
| Modify | `web-app/src/hooks/useChat.ts` |
| Modify | `web-app/src/pages/Home.tsx` |
| Modify | `web-app/src/pages/Chat.tsx` |
| Modify | `.gitignore` |
