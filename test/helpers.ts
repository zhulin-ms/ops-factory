/**
 * Integration test helpers — starts a real gateway + goosed instances.
 */
import { ChildProcess, spawn } from 'node:child_process'
import { resolve, join } from 'node:path'
import { writeFileSync, unlinkSync } from 'node:fs'
import { stringify } from 'yaml'
import { tmpdir } from 'node:os'
import net from 'node:net'

const PROJECT_ROOT = resolve(import.meta.dirname, '..')
const GATEWAY_DIR = join(PROJECT_ROOT, 'gateway')
const CONTROL_CENTER_DIR = join(PROJECT_ROOT, 'control-center')
const SECRET_KEY = 'test-secret'
export const CONTROL_CENTER_SECRET_KEY = 'test-control-center-secret'

export interface GatewayHandle {
  port: number
  baseUrl: string
  secretKey: string
  process: ChildProcess
  logs: string[]
  /** Fetch JSON with auth headers */
  fetch: (path: string, init?: RequestInit) => Promise<Response>
  /** Fetch JSON with auth + x-user-id */
  fetchAs: (userId: string, path: string, init?: RequestInit) => Promise<Response>
  /** Stop the gateway and all child goosed processes */
  stop: () => Promise<void>
}

export interface ControlCenterHandle {
  port: number
  baseUrl: string
  secretKey: string
  process: ChildProcess
  logs: string[]
  fetch: (path: string, init?: RequestInit) => Promise<Response>
  stop: () => Promise<void>
}

/** Pick a random free port */
export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

/**
 * Start a real gateway process and wait until it responds on /status.
 * Uses the actual project agents.yaml and agent configs.
 */
export async function startGateway(): Promise<GatewayHandle> {
  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}/gateway`
  const healthUrl = `http://127.0.0.1:${port}/gateway/status`

  // Write a temp config.yaml for this test run
  const testConfigPath = join(tmpdir(), `ops-factory-test-config-${port}.yaml`)
  const testConfig = {
    server: {
      host: '127.0.0.1',
      port,
      secretKey: SECRET_KEY,
      corsOrigin: '*',
    },
    paths: {
      projectRoot: PROJECT_ROOT,
      agentsDir: join(PROJECT_ROOT, 'gateway', 'agents'),
      usersDir: join(PROJECT_ROOT, 'gateway', 'users'),
      goosedBin: process.env.GOOSED_BIN || 'goosed',
    },
    idle: {
      timeoutMinutes: 0.5,       // 30s for testing
      checkIntervalMs: 5000,
    },
  }
  writeFileSync(testConfigPath, stringify(testConfig), 'utf-8')

  const child = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: GATEWAY_DIR,
    env: {
      ...process.env,
      CONFIG_PATH: testConfigPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  // Collect logs for debugging
  const logs: string[] = []
  child.stdout?.on('data', (d: Buffer) => {
    const line = d.toString().trim()
    if (line) logs.push(`[gw:out] ${line}`)
  })
  child.stderr?.on('data', (d: Buffer) => {
    const line = d.toString().trim()
    if (line) logs.push(`[gw:err] ${line}`)
  })

  // Wait for gateway to respond
  const maxWait = 30_000
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(healthUrl, {
        headers: { 'x-secret-key': SECRET_KEY, 'x-user-id': 'admin' },
        signal: AbortSignal.timeout(2000),
      })
      if (res.ok) break
    } catch {
      // not ready yet
    }
    await sleep(500)
  }

  // Verify it's up
  try {
    const res = await fetch(healthUrl, {
        headers: { 'x-secret-key': SECRET_KEY, 'x-user-id': 'admin' },
        signal: AbortSignal.timeout(3000),
      })
    if (!res.ok) {
      console.error('Gateway logs:', logs.join('\n'))
      throw new Error(`Gateway failed to start (HTTP ${res.status})`)
    }
  } catch (err) {
    console.error('Gateway logs:', logs.join('\n'))
    child.kill('SIGKILL')
    throw new Error(`Gateway failed to start: ${err}`)
  }

  const headers = (userId?: string) => {
    const h: Record<string, string> = {
      'x-secret-key': SECRET_KEY,
      'Content-Type': 'application/json',
    }
    if (userId) h['x-user-id'] = userId
    return h
  }

  return {
    port,
    baseUrl,
    secretKey: SECRET_KEY,
    process: child,
    logs,
    fetch: (path, init) =>
      fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers('admin'), ...init?.headers } }),
    fetchAs: (userId, path, init) =>
      fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers(userId), ...init?.headers } }),
    stop: async () => {
      child.kill('SIGTERM')
      await sleep(2000)
      if (!child.killed) child.kill('SIGKILL')
      await sleep(500)
      try { unlinkSync(testConfigPath) } catch { /* ignore */ }
    },
  }
}

/**
 * Start a Java gateway process and wait until it responds on /status.
 * Uses the maven-built JAR from gateway/gateway-service/target/.
 */
export async function startJavaGateway(extraEnv: Record<string, string> = {}): Promise<GatewayHandle> {
  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}/gateway`
  const healthUrl = `http://127.0.0.1:${port}/gateway/status`

  const jarPath = join(PROJECT_ROOT, 'gateway', 'gateway-service', 'target', 'gateway-service.jar')
  const libDir = join(PROJECT_ROOT, 'gateway', 'gateway-service', 'target', 'lib')

  const log4jConfig = join(PROJECT_ROOT, 'gateway', 'gateway-service', 'target', 'resources', 'log4j2.xml')
  const javaArgs = [
    `-Dloader.path=${libDir}`,
    `-Dserver.port=${port}`,
    '-Dserver.address=127.0.0.1',
    `-Dgateway.secret-key=${SECRET_KEY}`,
    `-Dgateway.goosed-bin=${process.env.GOOSED_BIN || 'goosed'}`,
    '-Dgateway.goose-tls=true',
    `-Dgateway.paths.project-root=${PROJECT_ROOT}`,
    '-Dgateway.cors-origin=*',
    `-Dlogging.config=file:${log4jConfig}`,
    '-jar', jarPath,
  ]

  const child = spawn('java', javaArgs, {
    cwd: join(PROJECT_ROOT, 'gateway'),
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const logs: string[] = []
  child.stdout?.on('data', (d: Buffer) => {
    const line = d.toString().trim()
    if (line) logs.push(`[gw:out] ${line}`)
  })
  child.stderr?.on('data', (d: Buffer) => {
    const line = d.toString().trim()
    if (line) logs.push(`[gw:err] ${line}`)
  })

  // Wait for gateway to respond
  const maxWait = 30_000
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(healthUrl, {
        headers: { 'x-secret-key': SECRET_KEY, 'x-user-id': 'admin' },
        signal: AbortSignal.timeout(2000),
      })
      if (res.ok) break
    } catch {
      // not ready yet
    }
    await sleep(500)
  }

  // Verify it's up
  try {
    const res = await fetch(healthUrl, {
        headers: { 'x-secret-key': SECRET_KEY, 'x-user-id': 'admin' },
        signal: AbortSignal.timeout(3000),
      })
    if (!res.ok) {
      console.error('Java gateway logs:', logs.join('\n'))
      throw new Error(`Java gateway failed to start (HTTP ${res.status})`)
    }
  } catch (err) {
    console.error('Java gateway logs:', logs.join('\n'))
    child.kill('SIGKILL')
    throw new Error(`Java gateway failed to start: ${err}`)
  }

  const headers = (userId?: string) => {
    const h: Record<string, string> = {
      'x-secret-key': SECRET_KEY,
      'Content-Type': 'application/json',
    }
    if (userId) h['x-user-id'] = userId
    return h
  }

  return {
    port,
    baseUrl,
    secretKey: SECRET_KEY,
    process: child,
    logs,
    fetch: (path, init) =>
      fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers('admin'), ...init?.headers } }),
    fetchAs: (userId, path, init) =>
      fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers(userId), ...init?.headers } }),
    stop: async () => {
      child.kill('SIGTERM')
      await sleep(3000)
      if (!child.killed) child.kill('SIGKILL')
      await sleep(500)
    },
  }
}

export async function startControlCenter(gatewayPort: number, fixedPort?: number): Promise<ControlCenterHandle> {
  const port = fixedPort ?? await freePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const jarPath = join(CONTROL_CENTER_DIR, 'target', 'control-center.jar')
  const testConfigPath = join(tmpdir(), `ops-factory-control-center-test-${port}.yaml`)

  const testConfig = {
    server: {
      port,
    },
    'control-center': {
      'secret-key': CONTROL_CENTER_SECRET_KEY,
      'cors-origin': '*',
      'request-timeout-ms': 5000,
      services: [
        {
          id: 'gateway',
          name: 'Gateway',
          'base-url': `http://127.0.0.1:${gatewayPort}`,
          required: true,
          'health-path': '/gateway/status',
          'ctl-component': 'gateway',
          'config-path': 'gateway/config.yaml',
          'log-path': 'gateway/logs/gateway.log',
          auth: {
            type: 'secret-key',
            'secret-key': SECRET_KEY,
          },
        },
        {
          id: 'knowledge-service',
          name: 'Knowledge Service',
          'base-url': 'http://127.0.0.1:8092',
          required: true,
          'health-path': '/actuator/health',
          'ctl-component': 'knowledge',
          'config-path': 'knowledge-service/config.yaml',
          'log-path': 'knowledge-service/logs/knowledge-service.log',
          auth: {
            type: 'none',
          },
        },
        {
          id: 'business-intelligence',
          name: 'Business Intelligence',
          'base-url': 'http://127.0.0.1:8093',
          required: false,
          'health-path': '/actuator/health',
          'ctl-component': 'business-intelligence',
          'config-path': 'business-intelligence/config.yaml',
          'log-path': 'business-intelligence/logs/business-intelligence.log',
          auth: {
            type: 'none',
          },
        },
      ],
      langfuse: {
        host: '',
        'public-key': '',
        'secret-key': '',
      },
    },
  }
  writeFileSync(testConfigPath, stringify(testConfig), 'utf-8')

  const child = spawn('java', [`-Dserver.port=${port}`, '-jar', jarPath], {
    cwd: CONTROL_CENTER_DIR,
    env: {
      ...process.env,
      CONFIG_PATH: testConfigPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const logs: string[] = []
  child.stdout?.on('data', (d: Buffer) => {
    const line = d.toString().trim()
    if (line) logs.push(`[cc:out] ${line}`)
  })
  child.stderr?.on('data', (d: Buffer) => {
    const line = d.toString().trim()
    if (line) logs.push(`[cc:err] ${line}`)
  })

  const maxWait = 30_000
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(`${baseUrl}/actuator/health`, {
        signal: AbortSignal.timeout(2000),
      })
      if (res.ok) break
    } catch {
      // not ready yet
    }
    await sleep(500)
  }

  try {
    const res = await fetch(`${baseUrl}/actuator/health`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) {
      console.error('Control-center logs:', logs.join('\n'))
      throw new Error(`Control-center failed to start (HTTP ${res.status})`)
    }
  } catch (err) {
    console.error('Control-center logs:', logs.join('\n'))
    child.kill('SIGKILL')
    throw new Error(`Control-center failed to start: ${err}`)
  }

  return {
    port,
    baseUrl,
    secretKey: CONTROL_CENTER_SECRET_KEY,
    process: child,
    logs,
    fetch: (path, init) =>
      fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          'x-secret-key': CONTROL_CENTER_SECRET_KEY,
          'Content-Type': 'application/json',
          ...init?.headers,
        },
      }),
    stop: async () => {
      child.kill('SIGTERM')
      await sleep(3000)
      if (!child.killed) child.kill('SIGKILL')
      await sleep(500)
      try { unlinkSync(testConfigPath) } catch { /* ignore */ }
    },
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
