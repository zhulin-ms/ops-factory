import type { FrontendLogLevel } from './types'

export interface WebappLoggingRuntimeConfig {
    level: FrontendLogLevel
    consoleEnabled: boolean
    bufferSize: number
    sink: 'console'
    logDirectory: string | null
}

const DEFAULT_CONFIG: WebappLoggingRuntimeConfig = {
    level: import.meta.env.DEV ? 'debug' : 'info',
    consoleEnabled: true,
    bufferSize: 200,
    sink: 'console',
    logDirectory: null,
}

let runtimeConfig: WebappLoggingRuntimeConfig = { ...DEFAULT_CONFIG }

function sanitizeLevel(level: string | undefined): FrontendLogLevel {
    switch (level) {
    case 'debug':
    case 'info':
    case 'warn':
    case 'error':
        return level
    default:
        return DEFAULT_CONFIG.level
    }
}

function sanitizeBufferSize(value: number | undefined) {
    if (!Number.isFinite(value) || value === undefined) {
        return DEFAULT_CONFIG.bufferSize
    }

    return Math.max(20, Math.min(1000, Math.floor(value)))
}

export function configureWebappLogging(config: Partial<WebappLoggingRuntimeConfig> | undefined) {
    runtimeConfig = {
        level: sanitizeLevel(config?.level),
        consoleEnabled: config?.consoleEnabled ?? DEFAULT_CONFIG.consoleEnabled,
        bufferSize: sanitizeBufferSize(config?.bufferSize),
        sink: 'console',
        logDirectory: null,
    }
}

export function getWebappLoggingConfig() {
    return { ...runtimeConfig }
}
