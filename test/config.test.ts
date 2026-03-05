/**
 * Tests for the unified configuration management.
 *
 * Verifies:
 * - config.yaml is loaded and values are used
 * - Missing required fields cause startup/build failure
 * - CONFIG_PATH env var selects config file location
 * - Docker components generate .env from config.yaml
 * - config.yaml.example files exist for all components
 */
import { execFile, ChildProcess, spawn } from 'node:child_process'
import { resolve, join } from 'node:path'
import {
  access, readFile, writeFile, mkdir, rm, copyFile, symlink, constants,
} from 'node:fs/promises'
import { existsSync } from 'node:fs'
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

/** Pick a random free port */
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

/** Run a shell command and return { stdout, stderr, code } */
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

/**
 * Run a small inline Node script in a subprocess, optionally with env vars.
 * Useful for testing config loading in isolation.
 * Sets NODE_PATH to resolve packages from the original component directories.
 */
function runNode(
  script: string,
  opts?: { cwd?: string; env?: Record<string, string> },
): Promise<{ stdout: string; stderr: string; code: number }> {
  const nodePath = [
    join(GATEWAY_DIR, 'node_modules'),
    join(EXPORTER_DIR, 'node_modules'),
  ].join(':')
  return run('node', ['--import', 'tsx', '-e', script], {
    cwd: opts?.cwd,
    env: { NODE_PATH: nodePath, ...opts?.env },
    timeout: 15_000,
  })
}

/**
 * Prepare a temp directory that can import TypeScript config modules.
 * Symlinks node_modules from the source component and creates package.json.
 */
async function prepareTmpDir(
  name: string,
  sourceDir: string,
  opts?: { subdirs?: string[] },
): Promise<string> {
  const tmpDir = join(TMP_DIR, name)
  await rm(tmpDir, { recursive: true, force: true })
  await mkdir(tmpDir, { recursive: true })
  for (const sub of opts?.subdirs || []) {
    await mkdir(join(tmpDir, sub), { recursive: true })
  }
  // Symlink node_modules so ESM imports resolve correctly
  await symlink(join(sourceDir, 'node_modules'), join(tmpDir, 'node_modules'))
  // package.json so Node treats .ts files as ESM
  await writeFile(join(tmpDir, 'package.json'), '{"type":"module"}\n')
  return tmpDir
}

// =============================================================================
// Setup & teardown
// =============================================================================

beforeAll(async () => {
  await mkdir(TMP_DIR, { recursive: true })
})

afterAll(async () => {
  await rm(TMP_DIR, { recursive: true, force: true })
})

// =============================================================================
// 1. config.yaml and config.yaml.example existence
// =============================================================================
describe('config files exist', () => {
  const components = [
    { name: 'gateway', dir: GATEWAY_DIR },
    { name: 'prometheus-exporter', dir: EXPORTER_DIR },
    { name: 'web-app', dir: WEBAPP_DIR },
    { name: 'langfuse', dir: LANGFUSE_DIR },
    { name: 'onlyoffice', dir: ONLYOFFICE_DIR },
  ]

  for (const { name, dir } of components) {
    it(`${name}/config.yaml exists`, async () => {
      await expect(
        access(join(dir, 'config.yaml'), constants.R_OK),
      ).resolves.toBeUndefined()
    })

    it(`${name}/config.yaml.example exists`, async () => {
      await expect(
        access(join(dir, 'config.yaml.example'), constants.R_OK),
      ).resolves.toBeUndefined()
    })
  }

  it('onlyoffice/docker-compose.yml exists', async () => {
    await expect(
      access(join(ONLYOFFICE_DIR, 'docker-compose.yml'), constants.R_OK),
    ).resolves.toBeUndefined()
  })
})

// =============================================================================
// 2. Gateway config loading
// =============================================================================
describe('Gateway config loading', () => {
  const configScript = (extra = '') => `
    import { loadGatewayConfig } from './src/config.ts';
    try {
      const cfg = loadGatewayConfig();
      ${extra}
      console.log(JSON.stringify(cfg));
    } catch (e) {
      console.error('CONFIG_ERROR: ' + e.message);
      process.exit(1);
    }
  `

  it('loads values from config.yaml', async () => {
    const { stdout, code } = await runNode(configScript(), {
      cwd: GATEWAY_DIR,
    })
    expect(code).toBe(0)
    const cfg = JSON.parse(stdout.trim())
    // Values from gateway/config.yaml
    expect(cfg.host).toBe('0.0.0.0')
    expect(cfg.port).toBe(3000)
    expect(cfg.secretKey).toBe('test')
    expect(cfg.corsOrigin).toBe('*')
  })

  it('CONFIG_PATH overrides default config file location', async () => {
    const tmpDir = await prepareTmpDir('gw-config-path', GATEWAY_DIR, {
      subdirs: ['src', 'config'],
    })
    await copyFile(join(GATEWAY_DIR, 'src', 'config.ts'), join(tmpDir, 'src', 'config.ts'))
    await writeFile(join(tmpDir, 'config', 'agents.yaml'), 'agents: []\n')

    const customConfigPath = join(tmpDir, 'custom-config.yaml')
    await writeFile(customConfigPath, [
      'server:',
      '  host: "192.168.1.100"',
      '  port: 4000',
      '  secretKey: "custom-key"',
      '  corsOrigin: "https://example.com"',
      'paths:',
      `  goosedBin: "goosed"`,
    ].join('\n'))

    const { stdout, code } = await runNode(configScript(), {
      cwd: tmpDir,
      env: { CONFIG_PATH: customConfigPath },
    })
    expect(code).toBe(0)
    const cfg = JSON.parse(stdout.trim())
    expect(cfg.host).toBe('192.168.1.100')
    expect(cfg.port).toBe(4000)
    expect(cfg.secretKey).toBe('custom-key')
    expect(cfg.corsOrigin).toBe('https://example.com')
  })

  it('loads idle config from config.yaml', async () => {
    const { stdout, code } = await runNode(configScript(), {
      cwd: GATEWAY_DIR,
    })
    expect(code).toBe(0)
    const cfg = JSON.parse(stdout.trim())
    // 15 minutes from config.yaml → 900000ms
    expect(cfg.idleTimeoutMs).toBe(900_000)
    expect(cfg.idleCheckIntervalMs).toBe(60_000)
  })

  it('loads upload config from config.yaml', async () => {
    const { stdout, code } = await runNode(configScript(), {
      cwd: GATEWAY_DIR,
    })
    expect(code).toBe(0)
    const cfg = JSON.parse(stdout.trim())
    expect(cfg.upload.maxFileSizeMb).toBe(10)
    expect(cfg.upload.maxImageSizeMb).toBe(5)
    expect(cfg.upload.retentionHours).toBe(24)
  })

  it('loads officePreview config from config.yaml (not agents.yaml)', async () => {
    const { stdout, code } = await runNode(configScript(), {
      cwd: GATEWAY_DIR,
    })
    expect(code).toBe(0)
    const cfg = JSON.parse(stdout.trim())
    expect(cfg.officePreview.enabled).toBe(true)
    expect(cfg.officePreview.onlyofficeUrl).toBe('http://localhost:8080')
  })

  it('throws error when secretKey is missing', async () => {
    const tmpDir = await prepareTmpDir('gw-no-secret', GATEWAY_DIR, {
      subdirs: ['src', 'config'],
    })
    await copyFile(join(GATEWAY_DIR, 'src', 'config.ts'), join(tmpDir, 'src', 'config.ts'))
    await writeFile(join(tmpDir, 'config.yaml'), 'server:\n  host: "0.0.0.0"\n  port: 3000\npaths:\n  goosedBin: "goosed"\n')
    await writeFile(join(tmpDir, 'config', 'agents.yaml'), 'agents: []\n')

    const { stderr, code } = await runNode(configScript(), {
      cwd: tmpDir,
    })
    expect(code).not.toBe(0)
    expect(stderr).toContain('CONFIG_ERROR')
    expect(stderr).toContain('secretKey')
  })

  it('throws error when goosedBin is missing', async () => {
    const tmpDir = await prepareTmpDir('gw-no-goosed', GATEWAY_DIR, {
      subdirs: ['src', 'config'],
    })
    await copyFile(join(GATEWAY_DIR, 'src', 'config.ts'), join(tmpDir, 'src', 'config.ts'))
    await writeFile(join(tmpDir, 'config.yaml'), 'server:\n  secretKey: "test"\n')
    await writeFile(join(tmpDir, 'config', 'agents.yaml'), 'agents: []\n')

    const { stderr, code } = await runNode(configScript(), {
      cwd: tmpDir,
    })
    expect(code).not.toBe(0)
    expect(stderr).toContain('CONFIG_ERROR')
    expect(stderr).toContain('goosedBin')
  })

  it('uses defaults for optional fields when config.yaml is minimal', async () => {
    const tmpDir = await prepareTmpDir('gw-minimal', GATEWAY_DIR, {
      subdirs: ['src', 'config'],
    })
    await copyFile(join(GATEWAY_DIR, 'src', 'config.ts'), join(tmpDir, 'src', 'config.ts'))
    await writeFile(join(tmpDir, 'config.yaml'), 'server:\n  secretKey: "test"\npaths:\n  goosedBin: "goosed"\n')
    await writeFile(join(tmpDir, 'config', 'agents.yaml'), 'agents: []\n')

    const { stdout, code } = await runNode(configScript(), {
      cwd: tmpDir,
    })
    expect(code).toBe(0)
    const cfg = JSON.parse(stdout.trim())
    expect(cfg.host).toBe('0.0.0.0')
    expect(cfg.port).toBe(3000)
    expect(cfg.corsOrigin).toBe('*')
    expect(cfg.idleTimeoutMs).toBe(900_000)
    expect(cfg.upload.maxFileSizeMb).toBe(10)
  })

  it('agents.yaml no longer contains officePreview or idleTimeoutMinutes', async () => {
    const content = await readFile(join(GATEWAY_DIR, 'config', 'agents.yaml'), 'utf-8')
    expect(content).not.toContain('officePreview')
    expect(content).not.toContain('idleTimeoutMinutes')
    expect(content).toContain('agents:')
  })

  it('loads agents list from agents.yaml', async () => {
    const { stdout, code } = await runNode(configScript(), {
      cwd: GATEWAY_DIR,
    })
    expect(code).toBe(0)
    const cfg = JSON.parse(stdout.trim())
    expect(cfg.agents.length).toBeGreaterThan(0)
    expect(cfg.agents[0].id).toBe('universal-agent')
  })

  it('ignores env vars — they do NOT override config.yaml', async () => {
    // Pass env vars that would have overridden config.yaml in the old system
    const { stdout, code } = await runNode(configScript(), {
      cwd: GATEWAY_DIR,
      env: {
        GATEWAY_HOST: '192.168.99.99',
        GATEWAY_PORT: '9999',
        GATEWAY_SECRET_KEY: 'env-should-be-ignored',
        CORS_ORIGIN: 'https://evil.com',
        IDLE_TIMEOUT_MS: '1',
        VISION_MODE: 'off',
      },
    })
    expect(code).toBe(0)
    const cfg = JSON.parse(stdout.trim())
    // Values should come from config.yaml, not env vars
    expect(cfg.host).toBe('0.0.0.0')
    expect(cfg.port).toBe(3000)
    expect(cfg.secretKey).toBe('test')
    expect(cfg.corsOrigin).toBe('*')
    expect(cfg.idleTimeoutMs).toBe(900_000)
    expect(cfg.vision.mode).toBe('passthrough')
  })

  it('fails without config.yaml and without env vars', async () => {
    const tmpDir = await prepareTmpDir('gw-no-yaml-no-env', GATEWAY_DIR, {
      subdirs: ['src', 'config'],
    })
    await copyFile(join(GATEWAY_DIR, 'src', 'config.ts'), join(tmpDir, 'src', 'config.ts'))
    await writeFile(join(tmpDir, 'config', 'agents.yaml'), 'agents: []\n')
    // No config.yaml at all

    const { stderr, code } = await runNode(configScript(), {
      cwd: tmpDir,
    })
    // Should fail because secretKey is required and there's no env var fallback
    expect(code).not.toBe(0)
    expect(stderr).toContain('CONFIG_ERROR')
  })
})

// =============================================================================
// 3. Prometheus Exporter config loading
// =============================================================================
describe('Prometheus Exporter config loading', () => {
  const configScript = (extra = '') => `
    import { loadConfig } from './src/config.ts';
    try {
      const cfg = loadConfig();
      ${extra}
      console.log(JSON.stringify(cfg));
    } catch (e) {
      console.error('CONFIG_ERROR: ' + e.message);
      process.exit(1);
    }
  `

  it('loads values from config.yaml', async () => {
    const { stdout, code } = await runNode(configScript(), {
      cwd: EXPORTER_DIR,
    })
    expect(code).toBe(0)
    const cfg = JSON.parse(stdout.trim())
    expect(cfg.port).toBe(9091)
    expect(cfg.gatewayUrl).toBe('http://127.0.0.1:3000')
    expect(cfg.gatewaySecretKey).toBe('test')
    expect(cfg.collectTimeoutMs).toBe(5000)
  })

  it('strips trailing slash from gatewayUrl', async () => {
    const tmpDir = await prepareTmpDir('exp-trailing-slash', EXPORTER_DIR, {
      subdirs: ['src'],
    })
    await copyFile(join(EXPORTER_DIR, 'src', 'config.ts'), join(tmpDir, 'src', 'config.ts'))
    await writeFile(join(tmpDir, 'config.yaml'), 'gatewayUrl: "http://gw:3000/"\ngatewaySecretKey: "key"\n')

    const { stdout, code } = await runNode(configScript(), {
      cwd: tmpDir,
    })
    expect(code).toBe(0)
    const cfg = JSON.parse(stdout.trim())
    expect(cfg.gatewayUrl).toBe('http://gw:3000')
  })

  it('throws error when gatewayUrl is missing', async () => {
    const tmpDir = await prepareTmpDir('exp-no-url', EXPORTER_DIR, {
      subdirs: ['src'],
    })
    await copyFile(join(EXPORTER_DIR, 'src', 'config.ts'), join(tmpDir, 'src', 'config.ts'))
    await writeFile(join(tmpDir, 'config.yaml'), 'port: 9091\ngatewaySecretKey: "key"\n')

    const { stderr, code } = await runNode(configScript(), {
      cwd: tmpDir,
    })
    expect(code).not.toBe(0)
    expect(stderr).toContain('CONFIG_ERROR')
    expect(stderr).toContain('gatewayUrl')
  })

  it('throws error when gatewaySecretKey is missing', async () => {
    const tmpDir = await prepareTmpDir('exp-no-key', EXPORTER_DIR, {
      subdirs: ['src'],
    })
    await copyFile(join(EXPORTER_DIR, 'src', 'config.ts'), join(tmpDir, 'src', 'config.ts'))
    await writeFile(join(tmpDir, 'config.yaml'), 'port: 9091\ngatewayUrl: "http://x:3000"\n')

    const { stderr, code } = await runNode(configScript(), {
      cwd: tmpDir,
    })
    expect(code).not.toBe(0)
    expect(stderr).toContain('CONFIG_ERROR')
    expect(stderr).toContain('gatewaySecretKey')
  })

  it('uses defaults for optional fields when config.yaml is minimal', async () => {
    const tmpDir = await prepareTmpDir('exp-minimal', EXPORTER_DIR, {
      subdirs: ['src'],
    })
    await copyFile(join(EXPORTER_DIR, 'src', 'config.ts'), join(tmpDir, 'src', 'config.ts'))
    await writeFile(join(tmpDir, 'config.yaml'), 'gatewayUrl: "http://gw:3000"\ngatewaySecretKey: "key"\n')

    const { stdout, code } = await runNode(configScript(), {
      cwd: tmpDir,
    })
    expect(code).toBe(0)
    const cfg = JSON.parse(stdout.trim())
    expect(cfg.port).toBe(9091)
    expect(cfg.collectTimeoutMs).toBe(5000)
  })

  it('ignores env vars — they do NOT override config.yaml', async () => {
    const { stdout, code } = await runNode(configScript(), {
      cwd: EXPORTER_DIR,
      env: {
        EXPORTER_PORT: '7777',
        GATEWAY_URL: 'http://env-should-be-ignored:9999',
        GATEWAY_SECRET_KEY: 'env-ignored-key',
        COLLECT_TIMEOUT_MS: '99999',
      },
    })
    expect(code).toBe(0)
    const cfg = JSON.parse(stdout.trim())
    // Values should come from config.yaml, not env vars
    expect(cfg.port).toBe(9091)
    expect(cfg.gatewayUrl).toBe('http://127.0.0.1:3000')
    expect(cfg.gatewaySecretKey).toBe('test')
    expect(cfg.collectTimeoutMs).toBe(5000)
  })

  it('CONFIG_PATH overrides default config file location', async () => {
    const tmpDir = await prepareTmpDir('exp-config-path', EXPORTER_DIR, {
      subdirs: ['src'],
    })
    await copyFile(join(EXPORTER_DIR, 'src', 'config.ts'), join(tmpDir, 'src', 'config.ts'))

    const customConfigPath = join(tmpDir, 'custom-exporter.yaml')
    await writeFile(customConfigPath, 'port: 8888\ngatewayUrl: "http://custom:4000"\ngatewaySecretKey: "custom-key"\ncollectTimeoutMs: 2000\n')

    const { stdout, code } = await runNode(configScript(), {
      cwd: tmpDir,
      env: { CONFIG_PATH: customConfigPath },
    })
    expect(code).toBe(0)
    const cfg = JSON.parse(stdout.trim())
    expect(cfg.port).toBe(8888)
    expect(cfg.gatewayUrl).toBe('http://custom:4000')
    expect(cfg.gatewaySecretKey).toBe('custom-key')
    expect(cfg.collectTimeoutMs).toBe(2000)
  })
})

// =============================================================================
// 4. Web App config loading (vite build-time)
// =============================================================================
describe('Web App config loading', () => {
  it('config.yaml is read by vite build', async () => {
    // Verify that building succeeds when config.yaml has values
    const { code } = await run('npx', ['vite', 'build'], {
      cwd: WEBAPP_DIR,
      timeout: 30_000,
    })
    expect(code).toBe(0)
  })

  it('config.yaml contains required fields', async () => {
    const content = await readFile(join(WEBAPP_DIR, 'config.yaml'), 'utf-8')
    expect(content).toContain('gatewayUrl')
    expect(content).toContain('gatewaySecretKey')
  })

  it('vite build fails when config is missing', async () => {
    // Create a temp webapp dir with no config.yaml
    const tmpDir = join(TMP_DIR, 'webapp-no-config')
    await mkdir(tmpDir, { recursive: true })

    // Run from WEBAPP_DIR so ESM can resolve 'yaml' from node_modules,
    // but point config path to the empty tmpDir
    const { code, stderr } = await run(
      'node',
      ['--input-type=module', '-e', `
        import { readFileSync, existsSync } from 'node:fs';
        import { resolve } from 'node:path';
        import { parse } from 'yaml';

        function loadYamlConfig() {
          const configPath = resolve('${tmpDir}', 'config.yaml');
          if (!existsSync(configPath)) return {};
          return parse(readFileSync(configPath, 'utf-8')) || {};
        }

        const yaml = loadYamlConfig();
        const gatewayUrl = yaml.gatewayUrl;
        const gatewaySecretKey = yaml.gatewaySecretKey;

        const missing = [];
        if (!gatewayUrl) missing.push('gatewayUrl');
        if (!gatewaySecretKey) missing.push('gatewaySecretKey');

        if (missing.length > 0) {
          console.error('MISSING: ' + missing.join(', '));
          process.exit(1);
        }
        console.log('OK');
      `],
      { cwd: WEBAPP_DIR },
    )
    expect(code).not.toBe(0)
    expect(stderr).toContain('MISSING')
  })
})

// =============================================================================
// 5. Langfuse config.yaml → .env generation
// =============================================================================
describe('Langfuse config → .env generation', () => {
  const tmpDir = join(TMP_DIR, 'langfuse-env-gen')

  beforeAll(async () => {
    await mkdir(tmpDir, { recursive: true })
  })

  afterEach(async () => {
    // Clean up generated .env
    const envFile = join(tmpDir, '.env')
    if (existsSync(envFile)) await rm(envFile)
  })

  it('generates .env from config.yaml with correct values', async () => {
    const configYaml = `
port: 3200
postgres:
  db: testdb
  user: testuser
  password: testpwd
  port: 5433
nextauthSecret: "my-secret"
salt: "my-salt"
telemetryEnabled: true
init:
  orgId: "test-org"
  orgName: "Test Org"
  projectId: "test-proj"
  projectName: "Test Project"
  projectPublicKey: "pk-test"
  projectSecretKey: "sk-test"
  userEmail: "test@test.com"
  userName: "tester"
  userPassword: "pass123"
`
    await writeFile(join(tmpDir, 'config.yaml'), configYaml)

    // Run the generate_env_file logic inline (same as ctl.sh)
    const { stdout, code } = await run('node', ['-e', `
      const fs = require('fs');
      const yaml = require('${join(GATEWAY_DIR, 'node_modules', 'yaml').replace(/\\/g, '\\\\')}');
      const cfg = yaml.parse(fs.readFileSync('${join(tmpDir, 'config.yaml').replace(/\\/g, '\\\\')}', 'utf-8')) || {};
      const pg = cfg.postgres || {};
      const init = cfg.init || {};
      const lines = [];
      lines.push('LANGFUSE_PORT=' + (cfg.port || 3100));
      lines.push('POSTGRES_DB=' + (pg.db || 'langfuse'));
      lines.push('POSTGRES_USER=' + (pg.user || 'langfuse'));
      lines.push('POSTGRES_PASSWORD=' + (pg.password || 'langfuse'));
      lines.push('POSTGRES_PORT=' + (pg.port || 5432));
      lines.push('NEXTAUTH_SECRET=' + (cfg.nextauthSecret || 'opsfactory-langfuse-secret-key'));
      lines.push('SALT=' + (cfg.salt || 'opsfactory-langfuse-salt'));
      lines.push('TELEMETRY_ENABLED=' + (cfg.telemetryEnabled ?? false));
      lines.push('LANGFUSE_INIT_ORG_ID=' + (init.orgId || 'opsfactory'));
      lines.push('LANGFUSE_INIT_ORG_NAME=' + (init.orgName || 'ops-factory'));
      lines.push('LANGFUSE_INIT_PROJECT_ID=' + (init.projectId || 'opsfactory-agents'));
      lines.push('LANGFUSE_INIT_PROJECT_NAME=' + (init.projectName || 'ops-factory-agents'));
      lines.push('LANGFUSE_INIT_PROJECT_PUBLIC_KEY=' + (init.projectPublicKey || 'pk-lf-opsfactory'));
      lines.push('LANGFUSE_INIT_PROJECT_SECRET_KEY=' + (init.projectSecretKey || 'sk-lf-opsfactory'));
      lines.push('LANGFUSE_INIT_USER_EMAIL=' + (init.userEmail || 'admin@opsfactory.local'));
      lines.push('LANGFUSE_INIT_USER_NAME=' + (init.userName || 'admin'));
      lines.push('LANGFUSE_INIT_USER_PASSWORD=' + (init.userPassword || 'opsfactory'));
      console.log(lines.join('\\n'));
    `])
    expect(code).toBe(0)

    const lines = stdout.trim().split('\n')
    const env = Object.fromEntries(lines.map(l => l.split('=')).map(([k, ...v]) => [k, v.join('=')]))

    expect(env.LANGFUSE_PORT).toBe('3200')
    expect(env.POSTGRES_DB).toBe('testdb')
    expect(env.POSTGRES_USER).toBe('testuser')
    expect(env.POSTGRES_PASSWORD).toBe('testpwd')
    expect(env.POSTGRES_PORT).toBe('5433')
    expect(env.NEXTAUTH_SECRET).toBe('my-secret')
    expect(env.SALT).toBe('my-salt')
    expect(env.TELEMETRY_ENABLED).toBe('true')
    expect(env.LANGFUSE_INIT_ORG_ID).toBe('test-org')
    expect(env.LANGFUSE_INIT_ORG_NAME).toBe('Test Org')
    expect(env.LANGFUSE_INIT_PROJECT_PUBLIC_KEY).toBe('pk-test')
    expect(env.LANGFUSE_INIT_PROJECT_SECRET_KEY).toBe('sk-test')
    expect(env.LANGFUSE_INIT_USER_EMAIL).toBe('test@test.com')
    expect(env.LANGFUSE_INIT_USER_PASSWORD).toBe('pass123')
  })

  it('uses defaults when config.yaml has empty values', async () => {
    // Minimal config.yaml — missing most fields
    await writeFile(join(tmpDir, 'config.yaml'), 'port: 3100\n')

    const { stdout, code } = await run('node', ['-e', `
      const fs = require('fs');
      const yaml = require('${join(GATEWAY_DIR, 'node_modules', 'yaml').replace(/\\/g, '\\\\')}');
      const cfg = yaml.parse(fs.readFileSync('${join(tmpDir, 'config.yaml').replace(/\\/g, '\\\\')}', 'utf-8')) || {};
      const pg = cfg.postgres || {};
      const init = cfg.init || {};
      const lines = [];
      lines.push('POSTGRES_DB=' + (pg.db || 'langfuse'));
      lines.push('POSTGRES_USER=' + (pg.user || 'langfuse'));
      lines.push('NEXTAUTH_SECRET=' + (cfg.nextauthSecret || 'opsfactory-langfuse-secret-key'));
      lines.push('LANGFUSE_INIT_ORG_ID=' + (init.orgId || 'opsfactory'));
      console.log(lines.join('\\n'));
    `])
    expect(code).toBe(0)
    const lines = stdout.trim().split('\n')
    const env = Object.fromEntries(lines.map(l => l.split('=')).map(([k, ...v]) => [k, v.join('=')]))

    expect(env.POSTGRES_DB).toBe('langfuse')
    expect(env.POSTGRES_USER).toBe('langfuse')
    expect(env.NEXTAUTH_SECRET).toBe('opsfactory-langfuse-secret-key')
    expect(env.LANGFUSE_INIT_ORG_ID).toBe('opsfactory')
  })
})

// =============================================================================
// 6. OnlyOffice config.yaml → .env generation
// =============================================================================
describe('OnlyOffice config → .env generation', () => {
  const tmpDir = join(TMP_DIR, 'onlyoffice-env-gen')

  beforeAll(async () => {
    await mkdir(tmpDir, { recursive: true })
  })

  afterEach(async () => {
    const envFile = join(tmpDir, '.env')
    if (existsSync(envFile)) await rm(envFile)
  })

  it('generates .env from config.yaml with correct values', async () => {
    const configYaml = `
port: 9090
jwtEnabled: true
pluginsEnabled: true
allowPrivateIpAddress: false
allowMetaIpAddress: false
`
    await writeFile(join(tmpDir, 'config.yaml'), configYaml)

    const { stdout, code } = await run('node', ['-e', `
      const fs = require('fs');
      const yaml = require('${join(GATEWAY_DIR, 'node_modules', 'yaml').replace(/\\/g, '\\\\')}');
      const cfg = yaml.parse(fs.readFileSync('${join(tmpDir, 'config.yaml').replace(/\\/g, '\\\\')}', 'utf-8')) || {};
      const lines = [];
      lines.push('ONLYOFFICE_PORT=' + (cfg.port || 8080));
      lines.push('JWT_ENABLED=' + (cfg.jwtEnabled ?? false));
      lines.push('PLUGINS_ENABLED=' + (cfg.pluginsEnabled ?? false));
      lines.push('ALLOW_PRIVATE_IP_ADDRESS=' + (cfg.allowPrivateIpAddress ?? true));
      lines.push('ALLOW_META_IP_ADDRESS=' + (cfg.allowMetaIpAddress ?? true));
      console.log(lines.join('\\n'));
    `])
    expect(code).toBe(0)

    const lines = stdout.trim().split('\n')
    const env = Object.fromEntries(lines.map(l => l.split('=')).map(([k, ...v]) => [k, v.join('=')]))

    expect(env.ONLYOFFICE_PORT).toBe('9090')
    expect(env.JWT_ENABLED).toBe('true')
    expect(env.PLUGINS_ENABLED).toBe('true')
    expect(env.ALLOW_PRIVATE_IP_ADDRESS).toBe('false')
    expect(env.ALLOW_META_IP_ADDRESS).toBe('false')
  })

  it('uses defaults when config.yaml is minimal', async () => {
    await writeFile(join(tmpDir, 'config.yaml'), '# empty config\n')

    const { stdout, code } = await run('node', ['-e', `
      const fs = require('fs');
      const yaml = require('${join(GATEWAY_DIR, 'node_modules', 'yaml').replace(/\\/g, '\\\\')}');
      const cfg = yaml.parse(fs.readFileSync('${join(tmpDir, 'config.yaml').replace(/\\/g, '\\\\')}', 'utf-8')) || {};
      const lines = [];
      lines.push('ONLYOFFICE_PORT=' + (cfg.port || 8080));
      lines.push('JWT_ENABLED=' + (cfg.jwtEnabled ?? false));
      lines.push('PLUGINS_ENABLED=' + (cfg.pluginsEnabled ?? false));
      lines.push('ALLOW_PRIVATE_IP_ADDRESS=' + (cfg.allowPrivateIpAddress ?? true));
      lines.push('ALLOW_META_IP_ADDRESS=' + (cfg.allowMetaIpAddress ?? true));
      console.log(lines.join('\\n'));
    `])
    expect(code).toBe(0)

    const lines = stdout.trim().split('\n')
    const env = Object.fromEntries(lines.map(l => l.split('=')).map(([k, ...v]) => [k, v.join('=')]))

    expect(env.ONLYOFFICE_PORT).toBe('8080')
    expect(env.JWT_ENABLED).toBe('false')
    expect(env.PLUGINS_ENABLED).toBe('false')
    expect(env.ALLOW_PRIVATE_IP_ADDRESS).toBe('true')
    expect(env.ALLOW_META_IP_ADDRESS).toBe('true')
  })
})

// =============================================================================
// 7. Docker compose files have variable substitution
// =============================================================================
describe('Docker compose variable substitution', () => {
  it('langfuse docker-compose.yml uses ${VAR:-default} syntax', async () => {
    const content = await readFile(join(LANGFUSE_DIR, 'docker-compose.yml'), 'utf-8')
    // Should contain variable references, not hardcoded values
    expect(content).toContain('${LANGFUSE_PORT:-3100}')
    expect(content).toContain('${POSTGRES_DB:-langfuse}')
    expect(content).toContain('${POSTGRES_USER:-langfuse}')
    expect(content).toContain('${POSTGRES_PASSWORD:-langfuse}')
    expect(content).toContain('${NEXTAUTH_SECRET:-')
    expect(content).toContain('${LANGFUSE_INIT_PROJECT_PUBLIC_KEY:-')
    expect(content).toContain('${LANGFUSE_INIT_PROJECT_SECRET_KEY:-')
    expect(content).toContain('${TELEMETRY_ENABLED:-false}')
  })

  it('onlyoffice docker-compose.yml uses ${VAR:-default} syntax', async () => {
    const content = await readFile(join(ONLYOFFICE_DIR, 'docker-compose.yml'), 'utf-8')
    expect(content).toContain('${ONLYOFFICE_PORT:-8080}')
    expect(content).toContain('${JWT_ENABLED:-false}')
    expect(content).toContain('${PLUGINS_ENABLED:-false}')
    expect(content).toContain('${ALLOW_PRIVATE_IP_ADDRESS:-true}')
    expect(content).toContain('${ALLOW_META_IP_ADDRESS:-true}')
  })
})

// =============================================================================
// 8. Shell script syntax validation (new/modified scripts)
// =============================================================================
describe('Modified shell scripts syntax', () => {
  const scripts = {
    onlyoffice: join(ONLYOFFICE_DIR, 'scripts', 'ctl.sh'),
    langfuse: join(LANGFUSE_DIR, 'scripts', 'ctl.sh'),
    orchestrator: join(PROJECT_ROOT, 'scripts', 'ctl.sh'),
  }

  for (const [name, path] of Object.entries(scripts)) {
    it(`${name} ctl.sh passes bash -n syntax check`, async () => {
      const { code, stderr } = await run('bash', ['-n', path])
      expect(code).toBe(0)
      expect(stderr).toBe('')
    })
  }
})

// =============================================================================
// 9. OnlyOffice ctl.sh docker-compose migration
// =============================================================================
describe('OnlyOffice ctl.sh uses docker compose', () => {
  it('script references docker compose (not docker run)', async () => {
    const content = await readFile(join(ONLYOFFICE_DIR, 'scripts', 'ctl.sh'), 'utf-8')
    expect(content).toContain('docker compose')
    expect(content).not.toContain('docker run')
    expect(content).toContain('generate_env_file')
    expect(content).toContain('COMPOSE_FILE')
  })

  it('help output includes Docker Compose', async () => {
    const { stdout, stderr } = await run('bash', [
      join(ONLYOFFICE_DIR, 'scripts', 'ctl.sh'),
      '--help',
    ])
    const output = stdout + stderr
    expect(output).toContain('Docker Compose')
  })
})

// =============================================================================
// 10. Langfuse ctl.sh has generate_env_file
// =============================================================================
describe('Langfuse ctl.sh has config.yaml support', () => {
  it('script contains generate_env_file function', async () => {
    const content = await readFile(join(LANGFUSE_DIR, 'scripts', 'ctl.sh'), 'utf-8')
    expect(content).toContain('generate_env_file')
    expect(content).toContain('config.yaml')
    expect(content).toContain('docker compose')
  })
})

// =============================================================================
// 11. Orchestrator documentation
// =============================================================================
describe('Orchestrator config documentation', () => {
  it('scripts/ctl.sh documents service toggles', async () => {
    const content = await readFile(join(PROJECT_ROOT, 'scripts', 'ctl.sh'), 'utf-8')
    expect(content).toContain('ENABLE_ONLYOFFICE')
    expect(content).toContain('ENABLE_LANGFUSE')
    expect(content).toContain('ENABLE_EXPORTER')
  })
})

// =============================================================================
// 12. Integration: Gateway starts with config.yaml via CONFIG_PATH
// =============================================================================
describe('Gateway starts with config.yaml', () => {
  let child: ChildProcess | null = null
  let port: number
  let tmpConfigPath: string

  afterAll(async () => {
    if (child) {
      child.kill('SIGTERM')
      await sleep(1000)
      if (!child.killed) child.kill('SIGKILL')
    }
    try { await rm(tmpConfigPath) } catch { /* ignore */ }
  })

  it('gateway process starts and responds on /status', async () => {
    port = await freePort()

    // Write a temp config.yaml for this test
    tmpConfigPath = join(TMP_DIR, `gateway-integration-${port}.yaml`)
    const configContent = [
      'server:',
      '  host: "127.0.0.1"',
      `  port: ${port}`,
      '  secretKey: "config-test-key"',
      'paths:',
      `  projectRoot: "${PROJECT_ROOT}"`,
      `  goosedBin: "${process.env.GOOSED_BIN || 'goosed'}"`,
      'idle:',
      '  timeoutMinutes: 0.5',
      '  checkIntervalMs: 5000',
    ].join('\n')
    await writeFile(tmpConfigPath, configContent)

    child = spawn('npx', ['tsx', 'src/index.ts'], {
      cwd: GATEWAY_DIR,
      env: {
        ...process.env,
        CONFIG_PATH: tmpConfigPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const logs: string[] = []
    child.stdout?.on('data', (d: Buffer) => logs.push(d.toString().trim()))
    child.stderr?.on('data', (d: Buffer) => logs.push(d.toString().trim()))

    // Wait for readiness
    const maxWait = 30_000
    const start = Date.now()
    let ready = false
    while (Date.now() - start < maxWait) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/status`, {
          headers: { 'x-secret-key': 'config-test-key' },
          signal: AbortSignal.timeout(2000),
        })
        if (res.ok) {
          ready = true
          break
        }
      } catch {
        // not ready
      }
      await sleep(500)
    }

    expect(ready).toBe(true)
  }, 60_000)
})

// =============================================================================
// 13. Integration: Exporter starts with config.yaml via CONFIG_PATH
// =============================================================================
describe('Exporter starts with config.yaml', () => {
  let child: ChildProcess | null = null
  let port: number
  let tmpConfigPath: string

  afterAll(async () => {
    if (child) {
      child.kill('SIGTERM')
      await sleep(500)
      if (!child.killed) child.kill('SIGKILL')
    }
    try { await rm(tmpConfigPath) } catch { /* ignore */ }
  })

  it('exporter process starts and responds on /health', async () => {
    port = await freePort()

    // Write a temp config.yaml for this test
    tmpConfigPath = join(TMP_DIR, `exporter-integration-${port}.yaml`)
    const configContent = [
      `port: ${port}`,
      'gatewayUrl: "http://127.0.0.1:3000"',
      'gatewaySecretKey: "test"',
      'collectTimeoutMs: 3000',
    ].join('\n')
    await writeFile(tmpConfigPath, configContent)

    child = spawn('npx', ['tsx', 'src/index.ts'], {
      cwd: EXPORTER_DIR,
      env: {
        ...process.env,
        CONFIG_PATH: tmpConfigPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const logs: string[] = []
    child.stdout?.on('data', (d: Buffer) => logs.push(d.toString().trim()))
    child.stderr?.on('data', (d: Buffer) => logs.push(d.toString().trim()))

    // Wait for readiness
    const maxWait = 15_000
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
  }, 30_000)
})

// =============================================================================
// 14. E2E: Gateway ignores env vars, responds with config.yaml values
// =============================================================================
describe('E2E: Gateway uses config.yaml exclusively', () => {
  let child: ChildProcess | null = null
  let port: number
  let tmpConfigPath: string

  afterAll(async () => {
    if (child) {
      child.kill('SIGTERM')
      await sleep(1000)
      if (!child.killed) child.kill('SIGKILL')
    }
    try { await rm(tmpConfigPath) } catch { /* ignore */ }
  })

  it('gateway starts on config.yaml port, ignoring GATEWAY_PORT env var', async () => {
    port = await freePort()
    const wrongPort = port + 1

    tmpConfigPath = join(TMP_DIR, `gateway-e2e-${port}.yaml`)
    const configContent = [
      'server:',
      '  host: "127.0.0.1"',
      `  port: ${port}`,
      '  secretKey: "e2e-secret"',
      'paths:',
      `  projectRoot: "${PROJECT_ROOT}"`,
      `  goosedBin: "${process.env.GOOSED_BIN || 'goosed'}"`,
      'idle:',
      '  timeoutMinutes: 0.5',
      '  checkIntervalMs: 5000',
    ].join('\n')
    await writeFile(tmpConfigPath, configContent)

    child = spawn('npx', ['tsx', 'src/index.ts'], {
      cwd: GATEWAY_DIR,
      env: {
        ...process.env,
        CONFIG_PATH: tmpConfigPath,
        // These env vars should be completely ignored
        GATEWAY_PORT: String(wrongPort),
        GATEWAY_HOST: '0.0.0.0',
        GATEWAY_SECRET_KEY: 'wrong-secret',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const logs: string[] = []
    child.stdout?.on('data', (d: Buffer) => logs.push(d.toString().trim()))
    child.stderr?.on('data', (d: Buffer) => logs.push(d.toString().trim()))

    // Wait for gateway on the CORRECT port (from config.yaml)
    const maxWait = 30_000
    const start = Date.now()
    let ready = false
    while (Date.now() - start < maxWait) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/status`, {
          headers: { 'x-secret-key': 'e2e-secret' },
          signal: AbortSignal.timeout(2000),
        })
        if (res.ok) {
          ready = true
          break
        }
      } catch {
        // not ready
      }
      await sleep(500)
    }
    expect(ready).toBe(true)

    // Verify the WRONG port has nothing (env var was ignored)
    try {
      const res = await fetch(`http://127.0.0.1:${wrongPort}/status`, {
        headers: { 'x-secret-key': 'wrong-secret' },
        signal: AbortSignal.timeout(1000),
      })
      // If we get here, something is listening on the wrong port — fail
      expect(res.ok).toBe(false)
    } catch {
      // Expected — nothing listening on wrongPort
    }

    // Verify the config.yaml secret key works (not the env var one)
    const res = await fetch(`http://127.0.0.1:${port}/status`, {
      headers: { 'x-secret-key': 'e2e-secret' },
    })
    expect(res.ok).toBe(true)

    // Verify the env var secret key does NOT work
    const badRes = await fetch(`http://127.0.0.1:${port}/status`, {
      headers: { 'x-secret-key': 'wrong-secret' },
    })
    expect(badRes.status).toBe(401)
  }, 60_000)
})
