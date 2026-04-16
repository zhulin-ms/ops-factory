import { getLoggingContext } from './context'
import { getWebappLoggingConfig } from './settings'
import type { FrontendLogEvent, FrontendLogLevel, FrontendLogPayload } from './types'

const LEVEL_PRIORITY: Record<FrontendLogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
}
const logBuffer: FrontendLogEvent[] = []

function shouldLog(level: FrontendLogLevel) {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getWebappLoggingConfig().level]
}

function pushToBuffer(event: FrontendLogEvent) {
    const { bufferSize } = getWebappLoggingConfig()

    logBuffer.push(event)
    if (logBuffer.length > bufferSize) {
        logBuffer.shift()
    }
}

function formatConsolePrefix(event: FrontendLogEvent) {
    const scope = `${event.category}:${event.name}`
    const result = event.result ? ` result=${event.result}` : ''
    const routeId = event.routeId ? ` route=${event.routeId}` : ''
    const requestId = event.requestId ? ` requestId=${event.requestId}` : ''

    return `[webapp-log] ${scope}${result}${routeId}${requestId}`
}

function emit(level: FrontendLogLevel, payload: FrontendLogPayload) {
    const event: FrontendLogEvent = {
        ts: new Date().toISOString(),
        level,
        ...getLoggingContext(),
        ...payload,
    }

    pushToBuffer(event)

    if (!shouldLog(level)) {
        return event
    }

    if (!getWebappLoggingConfig().consoleEnabled) {
        return event
    }

    const prefix = formatConsolePrefix(event)
    const details = { ...event }

    switch (level) {
    case 'debug':
        console.debug(prefix, details)
        break
    case 'info':
        console.info(prefix, details)
        break
    case 'warn':
        console.warn(prefix, details)
        break
    case 'error':
        console.error(prefix, details)
        break
    }

    return event
}

export function logDebug(payload: FrontendLogPayload) {
    return emit('debug', payload)
}

export function logInfo(payload: FrontendLogPayload) {
    return emit('info', payload)
}

export function logWarn(payload: FrontendLogPayload) {
    return emit('warn', payload)
}

export function logError(payload: FrontendLogPayload) {
    return emit('error', payload)
}

export function getLogBuffer() {
    return [...logBuffer]
}
