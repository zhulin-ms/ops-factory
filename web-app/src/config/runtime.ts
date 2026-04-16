import type { UserRole } from '../app/platform/providers/UserContext'
import { trackedFetch } from '../app/platform/logging/requestClient'
import { configureWebappLogging, type WebappLoggingRuntimeConfig } from '../app/platform/logging/settings'

interface RuntimeConfig {
    gatewayUrl?: string
    gatewaySecretKey?: string
    controlCenterUrl?: string
    controlCenterSecretKey?: string
    knowledgeServiceUrl?: string
    businessIntelligenceServiceUrl?: string
    logging?: {
        level?: WebappLoggingRuntimeConfig['level']
        consoleEnabled?: boolean
        bufferSize?: number
        sink?: 'console'
        logDirectory?: string | null
    }
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])
const GATEWAY_PATH_PREFIX = '/gateway'
const CONTROL_CENTER_PATH_PREFIX = '/control-center'
const KNOWLEDGE_PATH_PREFIX = '/knowledge'
const BUSINESS_INTELLIGENCE_PATH_PREFIX = '/business-intelligence'

function isLoopbackHost(host: string): boolean {
    return LOOPBACK_HOSTS.has(host)
}

function resolveGatewayUrl(raw: string | undefined): string {
    const pageHost = window.location.hostname || '127.0.0.1'
    const pageProtocol = window.location.protocol || 'http:'
    const fallbackOrigin = `${pageProtocol}//${pageHost}:3000`

    if (!raw) return `${GATEWAY_PATH_PREFIX}`

    try {
        const url = new URL(raw)
        if (isLoopbackHost(url.hostname) && url.hostname !== pageHost) {
            url.hostname = pageHost
        }
        return `${url.origin}${GATEWAY_PATH_PREFIX}`
    } catch {
        return `${fallbackOrigin}${GATEWAY_PATH_PREFIX}`
    }
}

function resolveKnowledgeServiceUrl(raw: string | undefined): string {
    const pageHost = window.location.hostname || '127.0.0.1'
    const pageProtocol = window.location.protocol || 'http:'
    const fallbackOrigin = `${pageProtocol}//${pageHost}:8092`

    if (!raw) return `${KNOWLEDGE_PATH_PREFIX}`

    try {
        const url = new URL(raw)
        if (isLoopbackHost(url.hostname) && url.hostname !== pageHost) {
            url.hostname = pageHost
        }
        return `${url.origin}${KNOWLEDGE_PATH_PREFIX}`
    } catch {
        return `${fallbackOrigin}${KNOWLEDGE_PATH_PREFIX}`
    }
}

function resolveControlCenterUrl(raw: string | undefined): string {
    const pageHost = window.location.hostname || '127.0.0.1'
    const pageProtocol = window.location.protocol || 'http:'
    const fallbackOrigin = `${pageProtocol}//${pageHost}:8094`

    if (!raw) return `${CONTROL_CENTER_PATH_PREFIX}`

    try {
        const url = new URL(raw)
        if (isLoopbackHost(url.hostname) && url.hostname !== pageHost) {
            url.hostname = pageHost
        }
        return `${url.origin}${CONTROL_CENTER_PATH_PREFIX}`
    } catch {
        return `${fallbackOrigin}${CONTROL_CENTER_PATH_PREFIX}`
    }
}

function resolveBusinessIntelligenceServiceUrl(raw: string | undefined): string {
    const pageHost = window.location.hostname || '127.0.0.1'
    const pageProtocol = window.location.protocol || 'http:'
    const fallbackOrigin = `${pageProtocol}//${pageHost}:8093`

    if (!raw) return `${BUSINESS_INTELLIGENCE_PATH_PREFIX}`

    try {
        const url = new URL(raw)
        if (isLoopbackHost(url.hostname) && url.hostname !== pageHost) {
            url.hostname = pageHost
        }
        return `${url.origin}${BUSINESS_INTELLIGENCE_PATH_PREFIX}`
    } catch {
        return `${fallbackOrigin}${BUSINESS_INTELLIGENCE_PATH_PREFIX}`
    }
}

const DEFAULT_SECRET_KEY = 'test'
export let GATEWAY_URL = resolveGatewayUrl(undefined)
export let GATEWAY_SECRET_KEY = DEFAULT_SECRET_KEY
export let CONTROL_CENTER_URL = resolveControlCenterUrl(undefined)
export let CONTROL_CENTER_SECRET_KEY = DEFAULT_SECRET_KEY
export let KNOWLEDGE_SERVICE_URL = resolveKnowledgeServiceUrl(undefined)
export let BUSINESS_INTELLIGENCE_SERVICE_URL = resolveBusinessIntelligenceServiceUrl(undefined)

function setRuntimeConfig(config: RuntimeConfig): void {
    GATEWAY_URL = resolveGatewayUrl(config.gatewayUrl)
    GATEWAY_SECRET_KEY = config.gatewaySecretKey || DEFAULT_SECRET_KEY
    CONTROL_CENTER_URL = resolveControlCenterUrl(config.controlCenterUrl)
    CONTROL_CENTER_SECRET_KEY = config.controlCenterSecretKey || DEFAULT_SECRET_KEY
    KNOWLEDGE_SERVICE_URL = resolveKnowledgeServiceUrl(config.knowledgeServiceUrl)
    BUSINESS_INTELLIGENCE_SERVICE_URL = resolveBusinessIntelligenceServiceUrl(config.businessIntelligenceServiceUrl)
    configureWebappLogging(config.logging)
}

async function loadRuntimeConfig(): Promise<RuntimeConfig> {
    const response = await trackedFetch('/config.json', {
        cache: 'no-store',
        category: 'app',
        name: 'app.context_init',
    })
    if (!response.ok) {
        throw new Error(`Failed to load /config.json (${response.status})`)
    }

    return (await response.json()) as RuntimeConfig
}

export async function initializeRuntimeConfig(): Promise<void> {
    const config = await loadRuntimeConfig()

    if (!config.gatewayUrl) {
        throw new Error('Missing required configuration: gatewayUrl')
    }
    if (!config.gatewaySecretKey) {
        throw new Error('Missing required configuration: gatewaySecretKey')
    }

    setRuntimeConfig(config)
}

export function isAdminUser(userId: string | null, role: UserRole | null): boolean {
    if (role === 'admin') return true
    return userId === 'admin'
}

/** Build gateway request headers with secret key and optional user ID. */
export function gatewayHeaders(userId?: string | null): Record<string, string> {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-secret-key': GATEWAY_SECRET_KEY,
    }
    if (userId) h['x-user-id'] = userId
    return h
}

export function controlCenterHeaders(): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'x-secret-key': CONTROL_CENTER_SECRET_KEY,
    }
}

/** Convert a display name to a kebab-case ID. */
export function slugify(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

/** Check if a session is a scheduled session. */
export function isScheduledSession(session: { session_type?: string; schedule_id?: string | null }): boolean {
    return session.session_type === 'scheduled' || !!session.schedule_id
}
