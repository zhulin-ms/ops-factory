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
