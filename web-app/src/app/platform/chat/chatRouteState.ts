import {
    createSessionLocator,
    isValidSessionLocator,
    parseSessionLocatorFromSearchParams,
    type SessionLocator,
    type SessionLocatorState,
} from '../../../utils/sessionLocator'

const CHAT_LOCATOR_STORAGE_KEY = 'opsfactory:chat:session-locator'

export interface ChatLocationState {
    initialMessage?: string
    preferredAgentId?: string
    sessionLocator?: SessionLocator
    startNew?: boolean
}

export interface ResolveChatRouteResult {
    initialMessage?: string
    locatorState: SessionLocatorState
    preferredAgentId: string | null
    source: 'idle' | 'search' | 'startNew' | 'state' | 'storage'
}

function normalizeOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const normalized = value.trim()
    return normalized || null
}

function readLocationState(value: unknown): ChatLocationState | null {
    if (!value || typeof value !== 'object') return null
    return value as ChatLocationState
}

function readSessionLocatorFromLocationState(value: unknown): SessionLocatorState | null {
    const state = readLocationState(value)
    if (!state || state.sessionLocator === undefined) return null

    if (!isValidSessionLocator(state.sessionLocator)) {
        return {
            kind: 'corrupted',
            reason: 'Route state contains an invalid session locator',
            rawValue: state.sessionLocator,
        }
    }

    return {
        kind: 'ready',
        locator: createSessionLocator(state.sessionLocator.sessionId, state.sessionLocator.agentId),
    }
}

function safeSessionStorageGetItem(key: string): string | null {
    try {
        return window.sessionStorage.getItem(key)
    } catch {
        return null
    }
}

function safeSessionStorageSetItem(key: string, value: string) {
    try {
        window.sessionStorage.setItem(key, value)
    } catch {
        // Ignore storage failures and keep navigation working in-memory.
    }
}

function safeSessionStorageRemoveItem(key: string) {
    try {
        window.sessionStorage.removeItem(key)
    } catch {
        // Ignore storage failures and keep navigation working in-memory.
    }
}

export function buildChatSessionState(
    sessionId: string,
    agentId: string,
    extras: Pick<ChatLocationState, 'initialMessage'> = {},
): ChatLocationState {
    const state: ChatLocationState = {
        sessionLocator: createSessionLocator(sessionId, agentId),
    }

    const initialMessage = normalizeOptionalString(extras.initialMessage)
    if (initialMessage) {
        state.initialMessage = initialMessage
    }

    return state
}

export function buildNewChatState(preferredAgentId?: string, initialMessage?: string): ChatLocationState {
    const state: ChatLocationState = {
        startNew: true,
    }

    const normalizedAgentId = normalizeOptionalString(preferredAgentId)
    const normalizedInitialMessage = normalizeOptionalString(initialMessage)

    if (normalizedAgentId) {
        state.preferredAgentId = normalizedAgentId
    }

    if (normalizedInitialMessage) {
        state.initialMessage = normalizedInitialMessage
    }

    return state
}

export function persistChatSessionLocator(locator: SessionLocator) {
    safeSessionStorageSetItem(CHAT_LOCATOR_STORAGE_KEY, JSON.stringify(locator))
}

export function clearPersistedChatSessionLocator() {
    safeSessionStorageRemoveItem(CHAT_LOCATOR_STORAGE_KEY)
}

export function readPersistedChatSessionLocator(): SessionLocator | null {
    const raw = safeSessionStorageGetItem(CHAT_LOCATOR_STORAGE_KEY)
    if (!raw) return null

    try {
        const parsed = JSON.parse(raw)
        if (!isValidSessionLocator(parsed)) return null
        return createSessionLocator(parsed.sessionId, parsed.agentId)
    } catch {
        return null
    }
}

export function resolveChatRouteState(searchParams: URLSearchParams, locationState: unknown): ResolveChatRouteResult {
    const state = readLocationState(locationState)
    const initialMessage = normalizeOptionalString(state?.initialMessage) ?? undefined
    const preferredAgentId = normalizeOptionalString(state?.preferredAgentId)

    if (state?.startNew) {
        return {
            initialMessage,
            locatorState: { kind: 'idle' },
            preferredAgentId,
            source: 'startNew',
        }
    }

    const stateLocator = readSessionLocatorFromLocationState(locationState)
    if (stateLocator) {
        return {
            initialMessage,
            locatorState: stateLocator,
            preferredAgentId,
            source: 'state',
        }
    }

    const searchLocator = parseSessionLocatorFromSearchParams(searchParams)
    if (searchLocator.kind !== 'idle') {
        return {
            initialMessage,
            locatorState: searchLocator,
            preferredAgentId,
            source: 'search',
        }
    }

    const storedLocator = readPersistedChatSessionLocator()
    if (storedLocator) {
        return {
            initialMessage,
            locatorState: { kind: 'ready', locator: storedLocator },
            preferredAgentId,
            source: 'storage',
        }
    }

    return {
        initialMessage,
        locatorState: { kind: 'idle' },
        preferredAgentId,
        source: 'idle',
    }
}
