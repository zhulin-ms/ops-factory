import { ChildProcess, spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { relative, join } from 'node:path'
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

  private getWorkspacePath(agentId: string): string {
    return `${this.config.agentsDir}/${agentId}/workspace`
  }

  private getGooseConfigDir(agentId: string): string {
    return `${this.config.agentsDir}/${agentId}/goose-config`
  }

  private getWorkspacePathRelative(agentId: string): string {
    const workspacePath = this.getWorkspacePath(agentId)
    const relativePath = relative(this.config.projectRoot, workspacePath)
    return relativePath || '.'
  }

  // Public method to get absolute workspace path for file operations
  getWorkspacePathAbsolute(agentId: string): string | null {
    const m = this.processes.get(agentId)
    if (!m) return null
    return this.getWorkspacePath(m.config.id)
  }

  private getAgentSkills(agentId: string): string[] {
    const skillsDir = join(this.getWorkspacePath(agentId), '.claude', 'skills')
    if (!existsSync(skillsDir)) return []

    try {
      return readdirSync(skillsDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .sort((a, b) => a.localeCompare(b))
    } catch {
      return []
    }
  }

  private async startAgent(agent: AgentConfig): Promise<void> {
    console.log(`Starting ${agent.id} on port ${agent.port}...`)

    // Ensure workspace directory exists
    const workspacePath = this.getWorkspacePath(agent.id)
    await mkdir(workspacePath, { recursive: true })

    // Ensure goose config directory exists (for per-agent MCP configuration)
    const gooseConfigDir = this.getGooseConfigDir(agent.id)
    await mkdir(gooseConfigDir, { recursive: true })

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      GOOSE_PORT: String(agent.port),
      GOOSE_HOST: agent.host,
      GOOSE_SERVER__SECRET_KEY: agent.secret_key,
      GOOSE_CONFIG_DIR: gooseConfigDir,
      ...(agent.env || {}),
    }

    const child = spawn(this.config.goosedBin, ['agent'], {
      env,
      cwd: workspacePath,
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

  listAgents(): Array<{
    id: string
    name: string
    status: string
    working_dir: string
    port: number
    provider?: string
    model?: string
    skills: string[]
  }> {
    return Array.from(this.processes.values()).map(m => ({
      id: m.config.id,
      name: m.config.name,
      status: m.status,
      working_dir: this.getWorkspacePathRelative(m.config.id),
      port: m.config.port,
      provider: m.config.env?.GOOSE_PROVIDER,
      model: m.config.env?.GOOSE_MODEL,
      skills: this.getAgentSkills(m.config.id),
    }))
  }

  async stopAll(): Promise<void> {
    for (const [, managed] of this.processes) {
      if (managed.child) {
        managed.child.kill('SIGTERM')
        managed.status = 'stopped'
      }
    }
    await new Promise(r => setTimeout(r, 1000))
  }
}
