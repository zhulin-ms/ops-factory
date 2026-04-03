export interface SessionLocator {
    sessionId: string
    agentId: string
}

export type SessionLocatorState =
    | { kind: 'idle' }
    | { kind: 'recovering'; sessionId: string; hintedAgentId: string | null }
    | { kind: 'ready'; locator: SessionLocator }
    | { kind: 'corrupted'; reason: string; rawValue?: unknown }

export class SessionLocatorError extends Error {
    readonly rawValue?: unknown

    constructor(message: string, rawValue?: unknown) {
        super(message)
        this.name = 'SessionLocatorError'
        this.rawValue = rawValue
    }
}

function normalizeRequiredField(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const normalized = value.trim()
    return normalized ? normalized : null
}

export function isValidSessionLocator(value: unknown): value is SessionLocator {
    if (!value || typeof value !== 'object') return false
    const candidate = value as Record<string, unknown>
    return !!normalizeRequiredField(candidate.sessionId) && !!normalizeRequiredField(candidate.agentId)
}

export function createSessionLocator(sessionId: string, agentId: string): SessionLocator {
    const normalizedSessionId = normalizeRequiredField(sessionId)
    const normalizedAgentId = normalizeRequiredField(agentId)

    if (!normalizedSessionId || !normalizedAgentId) {
        throw new SessionLocatorError('Session locator is incomplete', { sessionId, agentId })
    }

    return Object.freeze({
        sessionId: normalizedSessionId,
        agentId: normalizedAgentId,
    })
}

export function parseSessionLocatorFromSearchParams(searchParams: URLSearchParams): SessionLocatorState {
    const sessionId = normalizeRequiredField(searchParams.get('sessionId'))
    const agentId = normalizeRequiredField(searchParams.get('agent'))

    if (!sessionId && !agentId) {
        return { kind: 'idle' }
    }

    if (!sessionId && agentId) {
        return {
            kind: 'corrupted',
            reason: 'Agent id is present but session id is missing',
            rawValue: { sessionId: searchParams.get('sessionId'), agentId: searchParams.get('agent') },
        }
    }

    if (sessionId && !agentId) {
        return {
            kind: 'recovering',
            sessionId,
            hintedAgentId: null,
        }
    }

    try {
        return {
            kind: 'ready',
            locator: createSessionLocator(sessionId!, agentId!),
        }
    } catch (error) {
        return {
            kind: 'corrupted',
            reason: error instanceof Error ? error.message : 'Invalid session locator',
            rawValue: { sessionId, agentId },
        }
    }
}
