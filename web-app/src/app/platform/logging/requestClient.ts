import { createRequestId } from './ids'
import { logError, logInfo, logWarn } from './logger'
import type { FrontendLogCategory, FrontendLogPayload, FrontendLogResult } from './types'

const REQUEST_ID_HEADER = 'X-Request-Id'

type RequestTrackingOptions = {
    category?: FrontendLogCategory
    name?: string
    resultOnAbort?: FrontendLogResult
    interactionId?: string
    intent?: string
    targetType?: string
    targetId?: string
    timeoutMs?: number
}

export type TrackedRequestInit = RequestInit & RequestTrackingOptions

function toRequestUrl(input: RequestInfo | URL) {
    if (typeof input === 'string') {
        return input
    }

    if (input instanceof URL) {
        return input.toString()
    }

    return input.url
}

function toRequestPath(url: string) {
    try {
        const parsed = new URL(url, window.location.origin)
        return `${parsed.pathname}${parsed.search}`
    } catch {
        return url
    }
}

function createSignal(signal: AbortSignal | null | undefined, timeoutMs: number | undefined) {
    if (!signal && !timeoutMs) {
        return { signal: undefined, cleanup: () => {} }
    }

    const controller = new AbortController()
    const cleanupSteps: Array<() => void> = []

    if (signal) {
        if (signal.aborted) {
            controller.abort(signal.reason)
        } else {
            const abortFromSignal = () => controller.abort(signal.reason)
            signal.addEventListener('abort', abortFromSignal, { once: true })
            cleanupSteps.push(() => signal.removeEventListener('abort', abortFromSignal))
        }
    }

    if (timeoutMs && timeoutMs > 0) {
        const timer = window.setTimeout(() => {
            controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'TimeoutError'))
        }, timeoutMs)
        cleanupSteps.push(() => window.clearTimeout(timer))
    }

    return {
        signal: controller.signal,
        cleanup: () => cleanupSteps.forEach(step => step()),
    }
}

function resolveHeaders(input: RequestInfo | URL, initHeaders: HeadersInit | undefined, requestId: string) {
    const headers = input instanceof Request ? new Headers(input.headers) : new Headers()

    if (initHeaders) {
        new Headers(initHeaders).forEach((value, key) => headers.set(key, value))
    }

    if (!headers.has(REQUEST_ID_HEADER)) {
        headers.set(REQUEST_ID_HEADER, requestId)
    }

    return headers
}

function buildBasePayload(
    input: RequestInfo | URL,
    method: string,
    requestId: string,
    tracking: RequestTrackingOptions
): FrontendLogPayload {
    const path = toRequestPath(toRequestUrl(input))

    return {
        category: tracking.category ?? 'request',
        name: tracking.name ?? 'request.send',
        requestId,
        interactionId: tracking.interactionId,
        intent: tracking.intent,
        targetType: tracking.targetType,
        targetId: tracking.targetId,
        method,
        path,
    }
}

export async function trackedFetch(input: RequestInfo | URL, init: TrackedRequestInit = {}) {
    const requestId = init.headers instanceof Headers && init.headers.get(REQUEST_ID_HEADER)
        ? String(init.headers.get(REQUEST_ID_HEADER))
        : createRequestId()
    const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const signalState = createSignal(init.signal, init.timeoutMs)
    const headers = resolveHeaders(input, init.headers, requestId)
    const startedAt = Date.now()
    const payload = buildBasePayload(input, method, requestId, init)

    logInfo({
        ...payload,
        result: 'start',
    })

    try {
        const response = await fetch(input, {
            ...init,
            headers,
            signal: signalState.signal,
        })
        const resolvedRequestId = response.headers.get(REQUEST_ID_HEADER) || requestId
        const durationMs = Date.now() - startedAt

        logInfo({
            ...payload,
            requestId: resolvedRequestId,
            status: response.status,
            durationMs,
            result: response.ok ? 'success' : 'fail',
        })

        return response
    } catch (error) {
        const durationMs = Date.now() - startedAt
        const message = error instanceof Error ? error.message : String(error)
        const aborted = signalState.signal?.aborted === true

        const failurePayload: FrontendLogPayload = {
            ...payload,
            durationMs,
            errorCode: aborted ? 'request_aborted' : 'request_failed',
            errorMessage: message,
            result: aborted ? (init.resultOnAbort ?? 'cancel') : 'fail',
        }

        if (aborted) {
            logWarn(failurePayload)
        } else {
            logError(failurePayload)
        }

        throw error
    } finally {
        signalState.cleanup()
    }
}
