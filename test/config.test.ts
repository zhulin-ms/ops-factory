import { execFile, ChildProcess, spawn } from 'node:child_process'
import { resolve, join } from 'node:path'
import {
  access, readFile, writeFile, mkdir, rm, constants,
} from 'node:fs/promises'
import net from 'node:net'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { sleep } from './helpers.js'

const PROJECT_ROOT = resolve(import.meta.dirname, '..')
const GATEWAY_DIR = join(PROJECT_ROOT, 'gateway')
const EXPORTER_DIR = join(PROJECT_ROOT, 'prometheus-exporter')
const WEBAPP_DIR = join(PROJECT_ROOT, 'web-app')
const LANGFUSE_DIR = join(PROJECT_ROOT, 'langfuse')
const ONLYOFFICE_DIR = join(PROJECT_ROOT, 'onlyoffice')
const TMP_DIR = join(PROJECT_ROOT, 'test', '.tmp-config-test')
const MVN = process.env.MVN || '/tmp/apache-maven-3.9.6/bin/mvn'

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

function run(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; env?: Record<string, string>; timeout?: number },
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        cwd: opts?.cwd || PROJECT_ROOT,
        env: { ...process.env, ...opts?.env },
        timeout: opts?.timeout || 30_000,
      },
      (err, stdout, stderr) => {
        const code = err && 'code' in err ? (err.code as number) : err ? 1 : 0
        resolve({ stdout: stdout.toString(), stderr: stderr.toString(), code })
      },
    )
  })
}

beforeAll(async () => {
  await mkdir(TMP_DIR, { recursive: true })
})

afterAll(async () => {
  await rm(TMP_DIR, { recursive: true, force: true })
})

describe('config files exist', () => {
  const components = [
    { name: 'gateway', dir: GATEWAY_DIR },
    { name: 'prometheus-exporter', dir: EXPORTER_DIR },
    { name: 'web-app', dir: WEBAPP_DIR },
    { name: 'langfuse', dir: LANGFUSE_DIR },
    { name: 'onlyoffice', dir: ONLYOFFICE_DIR },
  ]

  for (const { name, dir } of components) {
    const configFileName = name === 'web-app' ? 'config.json' : 'config.yaml'
    const configExampleFileName = name === 'web-app' ? 'config.json.example' : 'config.yaml.example'

    it(`${name}/${configFileName} exists`, async () => {
      await expect(access(join(dir, configFileName), constants.R_OK)).resolves.toBeUndefined()
    })

    it(`${name}/${configExampleFileName} exists`, async () => {
      await expect(access(join(dir, configExampleFileName), constants.R_OK)).resolves.toBeUndefined()
    })
  }
})

describe('Docker compose variable substitution', () => {
  it('langfuse docker-compose.yml uses env default syntax', async () => {
    const content = await readFile(join(LANGFUSE_DIR, 'docker-compose.yml'), 'utf-8')
    expect(content).toContain('${LANGFUSE_PORT:-3100}')
    expect(content).toContain('${POSTGRES_DB:-langfuse}')
    expect(content).toContain('${TELEMETRY_ENABLED:-false}')
  })

  it('onlyoffice docker-compose.yml uses env default syntax', async () => {
    const content = await readFile(join(ONLYOFFICE_DIR, 'docker-compose.yml'), 'utf-8')
    expect(content).toContain('${ONLYOFFICE_PORT:-8080}')
    expect(content).toContain('${JWT_ENABLED:-false}')
  })
})

describe('shell scripts syntax', () => {
  const scripts = {
    gateway: join(GATEWAY_DIR, 'scripts', 'ctl.sh'),
    exporter: join(EXPORTER_DIR, 'scripts', 'ctl.sh'),
    onlyoffice: join(ONLYOFFICE_DIR, 'scripts', 'ctl.sh'),
    langfuse: join(LANGFUSE_DIR, 'scripts', 'ctl.sh'),
    orchestrator: join(PROJECT_ROOT, 'scripts', 'ctl.sh'),
  }

  for (const [name, path] of Object.entries(scripts)) {
    it(`${name} ctl.sh passes bash -n`, async () => {
      const { code, stderr } = await run('bash', ['-n', path])
      expect(code).toBe(0)
      expect(stderr).toBe('')
    })
  }
})

describe('orchestrator script docs', () => {
  it('scripts/ctl.sh documents service toggles', async () => {
    const content = await readFile(join(PROJECT_ROOT, 'scripts', 'ctl.sh'), 'utf-8')
    expect(content).toContain('ENABLE_ONLYOFFICE')
    expect(content).toContain('ENABLE_LANGFUSE')
    expect(content).toContain('ENABLE_EXPORTER')
  })
})

describe('gateway ctl.sh parses config.yaml correctly', () => {
  it('yaml_val extracts top-level string values', async () => {
    const tmpConfig = join(TMP_DIR, 'gw-yaml-val.yaml')
    await writeFile(tmpConfig, [
      'port: 4567',
      'host: "10.0.0.1"',
      'secretKey: "my-secret"',
      "corsOrigin: 'http://a.com,http://b.com'",
      'goosedBin: "/usr/local/bin/goosed"',
      'idleTimeoutMinutes: 30',
    ].join('\n'))

    // Inline the same yaml_val function used by ctl.sh
    const script = `
      yaml_val() {
        local key="$1" file="${tmpConfig}"
        [ -f "\${file}" ] || return 0
        awk -F': ' -v k="\${key}" '$1==k {print $2}' "\${file}" | head -n1 | sed "s/^[\\"']//;s/[\\"']$//"
      }
      echo "port=$(yaml_val port)"
      echo "host=$(yaml_val host)"
      echo "secretKey=$(yaml_val secretKey)"
      echo "corsOrigin=$(yaml_val corsOrigin)"
      echo "goosedBin=$(yaml_val goosedBin)"
      echo "idleTimeoutMinutes=$(yaml_val idleTimeoutMinutes)"
    `
    const { stdout, code } = await run('bash', ['-c', script])
    expect(code).toBe(0)
    expect(stdout).toContain('port=4567')
    expect(stdout).toContain('host=10.0.0.1')
    expect(stdout).toContain('secretKey=my-secret')
    expect(stdout).toContain('corsOrigin=http://a.com,http://b.com')
    expect(stdout).toContain('goosedBin=/usr/local/bin/goosed')
    expect(stdout).toContain('idleTimeoutMinutes=30')
  })

  it('yaml_nested_val extracts nested values', async () => {
    const tmpConfig = join(TMP_DIR, 'gw-yaml-nested.yaml')
    await writeFile(tmpConfig, [
      'langfuse:',
      '  host: "http://localhost:3100"',
      '  publicKey: "pk-test"',
      'officePreview:',
      '  enabled: true',
      '  onlyofficeUrl: "http://localhost:8080"',
    ].join('\n'))

    const script = `
      yaml_nested_val() {
        local section="$1" key="$2" file="${tmpConfig}"
        [ -f "\${file}" ] || return 0
        awk -F': ' -v section="\${section}" -v key="\${key}" '
          $0 ~ "^" section ":" { in_section=1; next }
          in_section && $0 ~ "^[^[:space:]]" { in_section=0 }
          in_section && $1 ~ "^[[:space:]]+" key "$" { print $2; exit }
        ' "\${file}" | sed "s/^[\\"']//;s/[\\"']$//"
      }
      echo "langfuse.host=$(yaml_nested_val langfuse host)"
      echo "langfuse.publicKey=$(yaml_nested_val langfuse publicKey)"
      echo "officePreview.enabled=$(yaml_nested_val officePreview enabled)"
      echo "officePreview.onlyofficeUrl=$(yaml_nested_val officePreview onlyofficeUrl)"
    `
    const { stdout, code } = await run('bash', ['-c', script])
    expect(code).toBe(0)
    expect(stdout).toContain('langfuse.host=http://localhost:3100')
    expect(stdout).toContain('langfuse.publicKey=pk-test')
    expect(stdout).toContain('officePreview.enabled=true')
    expect(stdout).toContain('officePreview.onlyofficeUrl=http://localhost:8080')
  })

  it('yaml_val returns empty when config.yaml is missing', async () => {
    const script = `
      yaml_val() {
        local key="$1" file="${TMP_DIR}/nonexistent.yaml"
        [ -f "\${file}" ] || return 0
        awk -F': ' -v k="\${key}" '$1==k {print $2}' "\${file}" | head -n1 | sed "s/^[\\"']//;s/[\\"']$//"
      }
      result="$(yaml_val port)"
      echo "result=[\${result}]"
    `
    const { stdout, code } = await run('bash', ['-c', script])
    expect(code).toBe(0)
    expect(stdout).toContain('result=[]')
  })

  it('env var overrides config.yaml value', async () => {
    const tmpConfig = join(TMP_DIR, 'gw-env-override.yaml')
    await writeFile(tmpConfig, 'port: 4567\nsecretKey: "from-yaml"\n')

    const script = `
      yaml_val() {
        local key="$1" file="${tmpConfig}"
        [ -f "\${file}" ] || return 0
        awk -F': ' -v k="\${key}" '$1==k {print $2}' "\${file}" | head -n1 | sed "s/^[\\"']//;s/[\\"']$//"
      }
      # Simulate env var > config.yaml > default (same logic as ctl.sh)
      GATEWAY_PORT="\${GATEWAY_PORT:-\$(yaml_val port)}"
      GATEWAY_PORT="\${GATEWAY_PORT:-3000}"
      GATEWAY_SECRET_KEY="\${GATEWAY_SECRET_KEY:-\$(yaml_val secretKey)}"
      GATEWAY_SECRET_KEY="\${GATEWAY_SECRET_KEY:-test}"
      echo "port=\${GATEWAY_PORT}"
      echo "secretKey=\${GATEWAY_SECRET_KEY}"
    `
    // With env override
    const withEnv = await run('bash', ['-c', script], {
      env: { ...process.env, GATEWAY_PORT: '9999', GATEWAY_SECRET_KEY: 'from-env' },
    })
    expect(withEnv.code).toBe(0)
    expect(withEnv.stdout).toContain('port=9999')
    expect(withEnv.stdout).toContain('secretKey=from-env')

    // Without env override (falls back to config.yaml)
    const withoutEnv = await run('bash', ['-c', script], {
      env: { ...process.env, GATEWAY_PORT: '', GATEWAY_SECRET_KEY: '' },
    })
    expect(withoutEnv.code).toBe(0)
    expect(withoutEnv.stdout).toContain('port=4567')
    expect(withoutEnv.stdout).toContain('secretKey=from-yaml')
  })
})

describe('file locations after refactoring', () => {
  it('onlyoffice.local.json is under onlyoffice/, not gateway/config/', async () => {
    await expect(
      access(join(ONLYOFFICE_DIR, 'onlyoffice.local.json'), constants.R_OK),
    ).resolves.toBeUndefined()

    await expect(
      access(join(GATEWAY_DIR, 'config', 'onlyoffice.local.json'), constants.R_OK),
    ).rejects.toThrow()
  })
})

describe('Exporter starts with config.yaml and env override', () => {
  let child: ChildProcess | null = null
  let tmpConfigPath = ''

  afterEach(async () => {
    if (child) {
      child.kill('SIGTERM')
      await sleep(1500)
      if (!child.killed) child.kill('SIGKILL')
      child = null
    }
    if (tmpConfigPath) {
      try { await rm(tmpConfigPath) } catch { /* ignore */ }
      tmpConfigPath = ''
    }
  })

  it('exporter starts and responds on /health with CONFIG_PATH', async () => {
    const port = await freePort()

    tmpConfigPath = join(TMP_DIR, `exporter-integration-${port}.yaml`)
    await writeFile(
      tmpConfigPath,
      [
        `port: ${port}`,
        'gatewayUrl: "http://127.0.0.1:3000"',
        'gatewaySecretKey: "test"',
        'collectTimeoutMs: 3000',
      ].join('\n'),
    )

    const build = await run(MVN, ['-q', '-DskipTests', 'package'], {
      cwd: EXPORTER_DIR,
      timeout: 120_000,
    })
    expect(build.code).toBe(0)

    child = spawn('java', [`-Dserver.port=${port}`, '-jar', 'target/prometheus-exporter.jar'], {
      cwd: EXPORTER_DIR,
      env: {
        ...process.env,
        CONFIG_PATH: tmpConfigPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const maxWait = 20_000
    const start = Date.now()
    let ready = false
    while (Date.now() - start < maxWait) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(1500),
        })
        if (res.ok) {
          ready = true
          break
        }
      } catch {
        // not ready
      }
      await sleep(250)
    }

    expect(ready).toBe(true)
  }, 150_000)

  it('EXPORTER_PORT overrides port from config.yaml', async () => {
    const configPort = await freePort()
    const envPort = await freePort()

    tmpConfigPath = join(TMP_DIR, `exporter-env-override-${configPort}.yaml`)
    await writeFile(
      tmpConfigPath,
      [
        `port: ${configPort}`,
        'gatewayUrl: "http://127.0.0.1:3000"',
        'gatewaySecretKey: "test"',
      ].join('\n'),
    )

    child = spawn('java', ['-jar', 'target/prometheus-exporter.jar'], {
      cwd: EXPORTER_DIR,
      env: {
        ...process.env,
        CONFIG_PATH: tmpConfigPath,
        EXPORTER_PORT: String(envPort),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const maxWait = 15_000
    const start = Date.now()
    let ready = false
    while (Date.now() - start < maxWait) {
      try {
        const res = await fetch(`http://127.0.0.1:${envPort}/health`, {
          signal: AbortSignal.timeout(1500),
        })
        if (res.ok) {
          ready = true
          break
        }
      } catch {
        // not ready
      }
      await sleep(250)
    }

    expect(ready).toBe(true)

    let configPortOpen = false
    try {
      const res = await fetch(`http://127.0.0.1:${configPort}/health`, {
        signal: AbortSignal.timeout(1000),
      })
      configPortOpen = res.ok
    } catch {
      configPortOpen = false
    }
    expect(configPortOpen).toBe(false)
  }, 60_000)
})
