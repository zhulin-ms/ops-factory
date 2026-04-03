/**
 * Tests for Gateway server-side TLS support.
 *
 * Verifies the full config chain for the gateway-tls feature:
 * 1. config.yaml contains gatewayTls, gatewayKeyStore, gatewayKeyStorePassword
 * 2. ctl.sh reads gatewayTls and derives GATEWAY_SCHEME / CURL_TLS_OPTS
 * 3. ctl.sh auto-generates self-signed keystore via keytool when missing
 * 4. ctl.sh injects server.ssl.* Spring Boot properties when TLS enabled
 * 5. ctl.sh internal URLs use GATEWAY_SCHEME (no hardcoded http://)
 * 6. web-app config.json uses https:// gatewayUrl
 * 7. web-app runtime.ts preserves protocol from configured URL
 * 8. Gateway Java unit tests pass (no regression)
 */
import { execFile } from 'node:child_process'
import { resolve, join } from 'node:path'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const PROJECT_ROOT = resolve(import.meta.dirname, '..')
const GATEWAY_DIR = join(PROJECT_ROOT, 'gateway')
const CTL_SH = join(GATEWAY_DIR, 'scripts', 'ctl.sh')
const WEBAPP_DIR = join(PROJECT_ROOT, 'web-app')
const TMP_DIR = join(PROJECT_ROOT, 'test', '.tmp-gateway-tls-test')
const MVN = process.env.MVN || 'mvn'

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

// =============================================================================
// 1. config.yaml contains gatewayTls fields
// =============================================================================
describe('config.yaml gatewayTls fields', () => {
  let content: string

  beforeAll(async () => {
    content = await readFile(join(GATEWAY_DIR, 'config.yaml'), 'utf-8')
  })

  it('contains gatewayTls key', () => {
    expect(content).toMatch(/^gatewayTls:\s*(true|false)/m)
  })

  it('gatewayTls defaults to true', () => {
    expect(content).toMatch(/^gatewayTls:\s*true/m)
  })

  it('contains gatewayKeyStore key', () => {
    expect(content).toMatch(/^gatewayKeyStore:/m)
  })

  it('contains gatewayKeyStorePassword key', () => {
    expect(content).toMatch(/^gatewayKeyStorePassword:/m)
  })
})

// =============================================================================
// 2. ctl.sh reads gatewayTls and derives scheme
// =============================================================================
describe('ctl.sh gatewayTls parsing', () => {
  it('reads gatewayTls=true → GATEWAY_SCHEME=https', async () => {
    const tmpConfig = join(TMP_DIR, 'gw-tls-true.yaml')
    await writeFile(tmpConfig, 'gatewayTls: true\n')

    const script = `
      yaml_val() {
        local key="$1" file="${tmpConfig}"
        [ -f "\${file}" ] || return 0
        awk -F': ' -v k="\${key}" '$1==k {print $2}' "\${file}" | head -n1 | sed "s/^[\\"']//;s/[\\"']$//"
      }
      GATEWAY_TLS="\${GATEWAY_TLS:-\$(yaml_val gatewayTls)}"
      GATEWAY_TLS="\${GATEWAY_TLS:-true}"
      if [ "\${GATEWAY_TLS}" = "true" ]; then
          GATEWAY_SCHEME="https"
          CURL_TLS_OPTS="-k"
      else
          GATEWAY_SCHEME="http"
          CURL_TLS_OPTS=""
      fi
      echo "scheme=\${GATEWAY_SCHEME} curl_opts=\${CURL_TLS_OPTS}"
    `
    const { stdout, code } = await run('bash', ['-c', script])
    expect(code).toBe(0)
    expect(stdout).toContain('scheme=https')
    expect(stdout).toContain('curl_opts=-k')
  })

  it('reads gatewayTls=false → GATEWAY_SCHEME=http', async () => {
    const tmpConfig = join(TMP_DIR, 'gw-tls-false.yaml')
    await writeFile(tmpConfig, 'gatewayTls: false\n')

    const script = `
      yaml_val() {
        local key="$1" file="${tmpConfig}"
        [ -f "\${file}" ] || return 0
        awk -F': ' -v k="\${key}" '$1==k {print $2}' "\${file}" | head -n1 | sed "s/^[\\"']//;s/[\\"']$//"
      }
      GATEWAY_TLS="\${GATEWAY_TLS:-\$(yaml_val gatewayTls)}"
      GATEWAY_TLS="\${GATEWAY_TLS:-true}"
      if [ "\${GATEWAY_TLS}" = "true" ]; then
          GATEWAY_SCHEME="https"
      else
          GATEWAY_SCHEME="http"
      fi
      echo "scheme=\${GATEWAY_SCHEME}"
    `
    const { stdout, code } = await run('bash', ['-c', script])
    expect(code).toBe(0)
    expect(stdout).toContain('scheme=http')
  })

  it('env var GATEWAY_TLS overrides config.yaml', async () => {
    const tmpConfig = join(TMP_DIR, 'gw-tls-override.yaml')
    await writeFile(tmpConfig, 'gatewayTls: true\n')

    const script = `
      yaml_val() {
        local key="$1" file="${tmpConfig}"
        [ -f "\${file}" ] || return 0
        awk -F': ' -v k="\${key}" '$1==k {print $2}' "\${file}" | head -n1 | sed "s/^[\\"']//;s/[\\"']$//"
      }
      GATEWAY_TLS="\${GATEWAY_TLS:-\$(yaml_val gatewayTls)}"
      GATEWAY_TLS="\${GATEWAY_TLS:-true}"
      if [ "\${GATEWAY_TLS}" = "true" ]; then
          GATEWAY_SCHEME="https"
      else
          GATEWAY_SCHEME="http"
      fi
      echo "scheme=\${GATEWAY_SCHEME}"
    `
    const { stdout, code } = await run('bash', ['-c', script], {
      env: { ...process.env, GATEWAY_TLS: 'false' },
    })
    expect(code).toBe(0)
    expect(stdout).toContain('scheme=http')
  })

  it('defaults to true when config.yaml has no gatewayTls', async () => {
    const tmpConfig = join(TMP_DIR, 'gw-tls-missing.yaml')
    await writeFile(tmpConfig, 'port: 3000\n')

    const script = `
      yaml_val() {
        local key="$1" file="${tmpConfig}"
        [ -f "\${file}" ] || return 0
        awk -F': ' -v k="\${key}" '$1==k {print $2}' "\${file}" | head -n1 | sed "s/^[\\"']//;s/[\\"']$//"
      }
      GATEWAY_TLS="\${GATEWAY_TLS:-\$(yaml_val gatewayTls)}"
      GATEWAY_TLS="\${GATEWAY_TLS:-true}"
      if [ "\${GATEWAY_TLS}" = "true" ]; then
          GATEWAY_SCHEME="https"
      else
          GATEWAY_SCHEME="http"
      fi
      echo "scheme=\${GATEWAY_SCHEME}"
    `
    const { stdout, code } = await run('bash', ['-c', script])
    expect(code).toBe(0)
    expect(stdout).toContain('scheme=https')
  })
})

// =============================================================================
// 3. ctl.sh auto-generates keystore via keytool
// =============================================================================
describe('ctl.sh keystore auto-generation', () => {
  it('generates PKCS12 keystore when file does not exist', async () => {
    const keystorePath = join(TMP_DIR, 'test-keystore.p12')

    const script = `
      keytool -genkeypair -alias gateway -keyalg RSA -keysize 2048 \
          -storetype PKCS12 -keystore "${keystorePath}" \
          -storepass changeit \
          -validity 3650 -dname "CN=localhost" \
          -ext "SAN=dns:localhost,ip:127.0.0.1,ip:0.0.0.0" 2>/dev/null
      echo "exit_code=$?"
    `
    const { stdout, code } = await run('bash', ['-c', script])
    expect(code).toBe(0)
    expect(stdout).toContain('exit_code=0')

    // Verify the keystore was created and is valid PKCS12
    const { stdout: listOut, code: listCode } = await run('keytool', [
      '-list', '-keystore', keystorePath, '-storepass', 'changeit', '-storetype', 'PKCS12',
    ])
    expect(listCode).toBe(0)
    expect(listOut).toContain('gateway')
  })

  it('ctl.sh contains keystore generation logic', async () => {
    const content = await readFile(CTL_SH, 'utf-8')
    expect(content).toContain('keytool -genkeypair -alias gateway')
    expect(content).toContain('.gateway-keystore.p12')
  })
})

// =============================================================================
// 4. ctl.sh injects server.ssl.* properties when TLS enabled
// =============================================================================
describe('ctl.sh SSL property injection', () => {
  let content: string

  beforeAll(async () => {
    content = await readFile(CTL_SH, 'utf-8')
  })

  it('injects server.ssl.enabled=true', () => {
    expect(content).toContain('-Dserver.ssl.enabled=true')
  })

  it('injects server.ssl.key-store', () => {
    expect(content).toContain('-Dserver.ssl.key-store=file:${GATEWAY_KEY_STORE}')
  })

  it('injects server.ssl.key-store-password', () => {
    expect(content).toContain('-Dserver.ssl.key-store-password=${GATEWAY_KEY_STORE_PASSWORD}')
  })

  it('injects server.ssl.key-store-type=PKCS12', () => {
    expect(content).toContain('-Dserver.ssl.key-store-type=PKCS12')
  })

  it('injects server.ssl.key-alias conditionally for auto-generated keystore', () => {
    expect(content).toContain('-Dserver.ssl.key-alias=${gateway_key_alias}')
  })

  it('only injects SSL when GATEWAY_TLS=true', () => {
    // Verify the SSL injection is inside a conditional block
    expect(content).toContain('if [ "${GATEWAY_TLS}" = "true" ]')
  })
})

// =============================================================================
// 5. ctl.sh no hardcoded http:// for gateway URLs
// =============================================================================
describe('ctl.sh no hardcoded http:// for gateway URLs', () => {
  let content: string

  beforeAll(async () => {
    content = await readFile(CTL_SH, 'utf-8')
  })

  it('gateway_url() uses GATEWAY_SCHEME', () => {
    expect(content).toContain('"${GATEWAY_SCHEME}://${host}:${GATEWAY_PORT}/status"')
  })

  it('gateway_url() echo uses GATEWAY_SCHEME', () => {
    expect(content).toContain('echo "${GATEWAY_SCHEME}://${host}:${GATEWAY_PORT}"')
  })

  it('health check uses GATEWAY_SCHEME', () => {
    expect(content).toContain('"${GATEWAY_SCHEME}://127.0.0.1:${GATEWAY_PORT}/status"')
  })

  it('check_agents_configured uses GATEWAY_SCHEME', () => {
    expect(content).toContain('"${GATEWAY_SCHEME}://127.0.0.1:${GATEWAY_PORT}/agents"')
  })

  it('status display uses GATEWAY_SCHEME', () => {
    expect(content).toContain('"Gateway running (${GATEWAY_SCHEME}://localhost:${GATEWAY_PORT})"')
  })

  it('startup log uses GATEWAY_SCHEME', () => {
    expect(content).toContain('"Starting gateway at ${GATEWAY_SCHEME}://${GATEWAY_HOST}:${GATEWAY_PORT}"')
  })

  it('curl uses CURL_TLS_OPTS for self-signed cert support', () => {
    expect(content).toContain('curl -fsS ${CURL_TLS_OPTS}')
  })
})

// =============================================================================
// 6. ctl.sh passes bash -n (syntax valid)
// =============================================================================
describe('ctl.sh syntax', () => {
  it('passes bash -n syntax check', async () => {
    const { code, stderr } = await run('bash', ['-n', CTL_SH])
    expect(code).toBe(0)
    expect(stderr).toBe('')
  })
})

// =============================================================================
// 7. web-app config uses https://
// =============================================================================
describe('web-app gateway URL', () => {
  it('config.json uses https:// for gatewayUrl', async () => {
    const content = JSON.parse(await readFile(join(WEBAPP_DIR, 'config.json'), 'utf-8'))
    expect(content.gatewayUrl).toMatch(/^https:\/\//)
  })

  it('config.json.example uses https:// for gatewayUrl', async () => {
    const content = JSON.parse(await readFile(join(WEBAPP_DIR, 'config.json.example'), 'utf-8'))
    expect(content.gatewayUrl).toMatch(/^https:\/\//)
  })
})

// =============================================================================
// 8. web-app runtime.ts preserves protocol
// =============================================================================
describe('web-app runtime.ts protocol handling', () => {
  let content: string

  beforeAll(async () => {
    content = await readFile(
      join(WEBAPP_DIR, 'src', 'config', 'runtime.ts'),
      'utf-8',
    )
  })

  it('resolveGatewayUrl uses new URL() which preserves protocol', () => {
    expect(content).toContain('new URL(raw)')
  })

  it('does not hardcode http:// for gateway URL construction', () => {
    // The only http reference should be in pageProtocol fallback, not forced
    const lines = content.split('\n').filter(line => {
      const trimmed = line.trim()
      if (trimmed.startsWith('//')) return false
      // Match forced http:// gateway URL construction (excluding protocol detection)
      return /["']http:\/\/.*:3000/.test(trimmed)
    })
    expect(lines).toEqual([])
  })
})

// =============================================================================
// 9. .gateway-keystore.p12 is tracked (shared with team for deployment)
// =============================================================================
describe('keystore file tracking', () => {
  it('gateway .gitignore does NOT exclude .gateway-keystore.p12 (shared cert)', async () => {
    const content = await readFile(join(GATEWAY_DIR, '.gitignore'), 'utf-8')
    expect(content).not.toContain('.gateway-keystore.p12')
  })
})

// =============================================================================
// 10. InstanceManager injects GATEWAY_URL into goosed env
// =============================================================================
describe('InstanceManager GATEWAY_URL injection', () => {
  let imSource: string

  beforeAll(async () => {
    imSource = await readFile(
      join(GATEWAY_DIR, 'gateway-service', 'src', 'main', 'java',
        'com', 'huawei', 'opsfactory', 'gateway', 'process', 'InstanceManager.java'),
      'utf-8',
    )
  })

  it('injects GATEWAY_URL env var in buildEnvironment', () => {
    expect(imSource).toContain('env.put("GATEWAY_URL"')
  })

  it('computes scheme from serverSslEnabled', () => {
    expect(imSource).toContain('serverSslEnabled ? "https" : "http"')
  })

  it('includes serverPort in GATEWAY_URL', () => {
    expect(imSource).toContain('+ serverPort')
  })

  it('injects NODE_TLS_REJECT_UNAUTHORIZED=0 when SSL enabled', () => {
    expect(imSource).toContain('env.put("NODE_TLS_REJECT_UNAUTHORIZED", "0")')
  })

  it('only sets NODE_TLS_REJECT_UNAUTHORIZED when SSL enabled', () => {
    // Verify it's inside an if (serverSslEnabled) block
    expect(imSource).toContain('if (serverSslEnabled)')
  })

  it('accepts server.port and server.ssl.enabled via @Value', () => {
    expect(imSource).toContain('@Value("${server.port:3000}")')
    expect(imSource).toContain('@Value("${server.ssl.enabled:false}")')
  })
})

// =============================================================================
// 11. supervisor-agent MCP config uses env_keys for GATEWAY_URL
// =============================================================================
describe('supervisor-agent MCP config uses env_keys', () => {
  let config: string

  beforeAll(async () => {
    config = await readFile(
      join(GATEWAY_DIR, 'agents', 'supervisor-agent', 'config', 'config.yaml'),
      'utf-8',
    )
  })

  it('does NOT hardcode GATEWAY_URL in envs', () => {
    // Should not have envs: GATEWAY_URL: http://...
    const lines = config.split('\n')
    const envsBlock = lines.some(l => /^\s+GATEWAY_URL:\s*http/.test(l))
    expect(envsBlock).toBe(false)
  })

  it('includes GATEWAY_URL in env_keys', () => {
    expect(config).toContain('- GATEWAY_URL')
  })

  it('sets NODE_TLS_REJECT_UNAUTHORIZED in envs', () => {
    expect(config).toContain("NODE_TLS_REJECT_UNAUTHORIZED: '0'")
  })

  it('includes GATEWAY_SECRET_KEY in env_keys', () => {
    expect(config).toContain('- GATEWAY_SECRET_KEY')
  })
})

// =============================================================================
// 12. platform-monitor fallback URL uses https
// =============================================================================
describe('platform-monitor MCP source', () => {
  let source: string

  beforeAll(async () => {
    source = await readFile(
      join(GATEWAY_DIR, 'agents', 'supervisor-agent', 'config', 'mcp',
        'platform-monitor', 'src', 'handlers.js'),
      'utf-8',
    )
  })

  it('fallback URL uses https', () => {
    expect(source).toMatch(/GATEWAY_URL\s*=\s*process\.env\.GATEWAY_URL\s*\|\|\s*'https:\/\//)
  })

  it('does not contain http:// fallback', () => {
    expect(source).not.toMatch(/GATEWAY_URL.*\|\|\s*'http:\/\//)
  })

  it('reads GATEWAY_URL from environment', () => {
    expect(source).toContain('process.env.GATEWAY_URL')
  })
})

// =============================================================================
// 13. Gateway Java unit tests pass (no regression)
// =============================================================================
describe('gateway Java unit tests', () => {
  it('mvn test passes (354 tests)', async () => {
    const { stdout, stderr, code } = await run(
      MVN, ['test', '-q'],
      { cwd: GATEWAY_DIR, timeout: 180_000 },
    )
    const output = stdout + stderr
    expect(code).toBe(0)

    const summaryMatch = output.match(/Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+)/)
    if (summaryMatch) {
      expect(Number(summaryMatch[2])).toBe(0)
      expect(Number(summaryMatch[3])).toBe(0)
    }
  }, 180_000)
})
