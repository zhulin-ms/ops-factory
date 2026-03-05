import { readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

export interface AgentConfig {
  id: string
  name: string
  host: string
  secret_key: string
  sysOnly: boolean
}

export interface GatewayYamlConfig {
  agents: Array<{
    id: string
    name: string
    sysOnly?: boolean
  }>
}

export interface OfficePreviewConfig {
  enabled: boolean
  onlyofficeUrl: string
  fileBaseUrl: string
}

export interface VisionGlobalConfig {
  mode: string            // 'off' | 'passthrough' | 'preprocess'
  provider: string
  model: string
  apiKey: string
  baseUrl: string
  maxTokens: number
  prompt: string
}

export interface UploadConfig {
  maxFileSizeMb: number
  maxImageSizeMb: number
  retentionHours: number
}

export interface LangfuseConfig {
  host: string
  publicKey: string
  secretKey: string
}

export interface TlsConfig {
  enabled: boolean
  cert: string
  key: string
}

export interface GatewayConfig {
  host: string
  port: number
  secretKey: string
  corsOrigin: string
  tls: TlsConfig
  projectRoot: string
  agentsDir: string
  usersDir: string
  goosedBin: string
  agents: AgentConfig[]
  officePreview: OfficePreviewConfig
  idleTimeoutMs: number
  idleCheckIntervalMs: number
  upload: UploadConfig
  vision: VisionGlobalConfig
  langfuse: LangfuseConfig | null
}

// --- config.yaml type ---
interface ConfigYaml {
  server?: {
    host?: string
    port?: number
    secretKey?: string
    corsOrigin?: string
  }
  tls?: {
    cert?: string
    key?: string
  }
  paths?: {
    projectRoot?: string
    agentsDir?: string
    usersDir?: string
    goosedBin?: string
  }
  idle?: {
    timeoutMinutes?: number
    checkIntervalMs?: number
  }
  upload?: {
    maxFileSizeMb?: number
    maxImageSizeMb?: number
    retentionHours?: number
  }
  officePreview?: {
    enabled?: boolean
    onlyofficeUrl?: string
    fileBaseUrl?: string
  }
  vision?: {
    mode?: string
    provider?: string
    model?: string
    apiKey?: string
    baseUrl?: string
    maxTokens?: number
    prompt?: string
  }
  langfuse?: {
    host?: string
    publicKey?: string
    secretKey?: string
  }
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Load a YAML file and return the parsed object, or an empty object if not found.
 */
function loadYamlFile<T>(filePath: string): T {
  if (!existsSync(filePath)) return {} as T
  return (parse(readFileSync(filePath, 'utf-8')) as T) || ({} as T)
}

export function loadGatewayConfig(): GatewayConfig {
  // CONFIG_PATH is the only env var the gateway reads — a bootstrap mechanism to locate the config file.
  const configYamlPath = process.env.CONFIG_PATH || resolve(__dirname, '..', 'config.yaml')
  const cfg = loadYamlFile<ConfigYaml>(configYamlPath)

  // --- Server ---
  const host = cfg.server?.host || '0.0.0.0'
  const port = cfg.server?.port ?? 3000
  const corsOrigin = cfg.server?.corsOrigin || '*'

  const secretKey = cfg.server?.secretKey || ''
  if (!secretKey) {
    throw new Error('Missing required config: set "server.secretKey" in gateway/config.yaml')
  }

  // --- TLS ---
  const tlsCert = cfg.tls?.cert || ''
  const tlsKey = cfg.tls?.key || ''
  const tls: TlsConfig = {
    enabled: !!(tlsCert && tlsKey),
    cert: tlsCert,
    key: tlsKey,
  }

  // --- Paths ---
  const projectRoot = resolve(
    cfg.paths?.projectRoot || join(__dirname, '../..')
  )
  const agentsDir = resolve(
    cfg.paths?.agentsDir || join(projectRoot, 'gateway', 'agents')
  )
  const usersDir = resolve(
    cfg.paths?.usersDir || join(projectRoot, 'gateway', 'users')
  )
  const goosedBin = cfg.paths?.goosedBin
  if (!goosedBin) {
    throw new Error('Missing required config: set "paths.goosedBin" in gateway/config.yaml')
  }

  // --- Load agents registry (separate file, unchanged) ---
  const gatewayConfigDir = resolve(__dirname, '../config')
  const agentsConfigPath = join(gatewayConfigDir, 'agents.yaml')

  let agentsYaml: GatewayYamlConfig = { agents: [] }
  if (existsSync(agentsConfigPath)) {
    agentsYaml = parse(readFileSync(agentsConfigPath, 'utf-8')) as GatewayYamlConfig
  } else {
    console.warn(`Warning: Gateway agents config not found at ${agentsConfigPath}`)
  }

  const agents: AgentConfig[] = (agentsYaml.agents || []).map(agent => ({
    id: agent.id,
    name: agent.name,
    host,
    secret_key: secretKey,
    sysOnly: agent.sysOnly ?? false,
  }))

  // --- Office Preview ---
  const yamlOp = cfg.officePreview || {}
  const officePreview: OfficePreviewConfig = {
    enabled: yamlOp.enabled ?? false,
    onlyofficeUrl: yamlOp.onlyofficeUrl || 'http://localhost:8080',
    fileBaseUrl: yamlOp.fileBaseUrl || `http://host.docker.internal:${port}`,
  }

  // --- Idle ---
  const idleTimeoutMinutes = cfg.idle?.timeoutMinutes ?? 15
  const idleTimeoutMs = idleTimeoutMinutes * 60 * 1000
  const idleCheckIntervalMs = cfg.idle?.checkIntervalMs ?? 60000

  // --- Upload ---
  const upload: UploadConfig = {
    maxFileSizeMb: cfg.upload?.maxFileSizeMb ?? 10,
    maxImageSizeMb: cfg.upload?.maxImageSizeMb ?? 5,
    retentionHours: cfg.upload?.retentionHours ?? 24,
  }

  // --- Vision ---
  const DEFAULT_VISION_PROMPT = `Analyze this image thoroughly. Describe:
- Main content and subject matter
- Any text, numbers, or data visible
- Charts, tables, or diagrams if present
- Layout and structural elements
- Any relevant details that would help answer questions about this image
Be precise and factual.`

  const vision: VisionGlobalConfig = {
    mode: cfg.vision?.mode || 'passthrough',
    provider: cfg.vision?.provider || '',
    model: cfg.vision?.model || '',
    apiKey: cfg.vision?.apiKey || '',
    baseUrl: cfg.vision?.baseUrl || '',
    maxTokens: cfg.vision?.maxTokens ?? 1024,
    prompt: cfg.vision?.prompt || DEFAULT_VISION_PROMPT,
  }

  // --- Langfuse ---
  // Priority: config.yaml > auto-detect from agent configs
  let langfuse: LangfuseConfig | null = null
  {
    let lfHost = cfg.langfuse?.host || ''
    let lfPub  = cfg.langfuse?.publicKey || ''
    let lfSec  = cfg.langfuse?.secretKey || ''

    if (!lfHost || !lfPub || !lfSec) {
      // Auto-detect from agent configs
      for (const agent of agentsYaml.agents || []) {
        const cfgPath = join(agentsDir, agent.id, 'config', 'config.yaml')
        if (!existsSync(cfgPath)) continue
        try {
          const agentCfg = parse(readFileSync(cfgPath, 'utf-8')) as Record<string, unknown>
          if (!lfHost && agentCfg.LANGFUSE_URL) lfHost = String(agentCfg.LANGFUSE_URL)
          if (!lfPub && agentCfg.LANGFUSE_INIT_PROJECT_PUBLIC_KEY) lfPub = String(agentCfg.LANGFUSE_INIT_PROJECT_PUBLIC_KEY)
          if (!lfSec && agentCfg.LANGFUSE_INIT_PROJECT_SECRET_KEY) lfSec = String(agentCfg.LANGFUSE_INIT_PROJECT_SECRET_KEY)
          if (lfHost && lfPub && lfSec) break
        } catch { /* skip */ }
      }
    }

    if (lfHost && lfPub && lfSec) {
      langfuse = { host: lfHost.replace(/\/+$/, ''), publicKey: lfPub, secretKey: lfSec }
    }
  }

  return {
    host,
    port,
    secretKey,
    corsOrigin,
    tls,
    projectRoot,
    agentsDir,
    usersDir,
    goosedBin,
    agents,
    officePreview,
    idleTimeoutMs,
    idleCheckIntervalMs,
    upload,
    vision,
    langfuse,
  }
}
