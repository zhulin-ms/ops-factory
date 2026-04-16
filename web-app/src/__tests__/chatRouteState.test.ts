import { beforeEach, describe, expect, it } from 'vitest'
import {
    buildChatSessionState,
    buildNewChatState,
    clearPersistedChatSessionLocator,
    persistChatSessionLocator,
    resolveChatRouteState,
} from '../app/platform/chat/chatRouteState'

describe('chatRouteState', () => {
    beforeEach(() => {
        window.sessionStorage.clear()
        clearPersistedChatSessionLocator()
    })

    it('builds new chat state without embedding session params in the url', () => {
        expect(buildNewChatState('universal-agent', 'hello')).toEqual({
            startNew: true,
            preferredAgentId: 'universal-agent',
            initialMessage: 'hello',
        })
    })

    it('resolves session locator from route state first', () => {
        const result = resolveChatRouteState(
            new URLSearchParams('sessionId=legacy-session&agent=legacy-agent'),
            buildChatSessionState('state-session', 'state-agent'),
        )

        expect(result.source).toBe('state')
        expect(result.locatorState).toEqual({
            kind: 'ready',
            locator: {
                sessionId: 'state-session',
                agentId: 'state-agent',
            },
        })
    })

    it('uses session storage when the url has no session params', () => {
        persistChatSessionLocator({
            sessionId: 'stored-session',
            agentId: 'stored-agent',
        })

        const result = resolveChatRouteState(new URLSearchParams(''), null)

        expect(result.source).toBe('storage')
        expect(result.locatorState).toEqual({
            kind: 'ready',
            locator: {
                sessionId: 'stored-session',
                agentId: 'stored-agent',
            },
        })
    })

    it('treats explicit new-chat route state as higher priority than stored session', () => {
        persistChatSessionLocator({
            sessionId: 'stored-session',
            agentId: 'stored-agent',
        })

        const result = resolveChatRouteState(new URLSearchParams(''), buildNewChatState('universal-agent'))

        expect(result.source).toBe('startNew')
        expect(result.preferredAgentId).toBe('universal-agent')
        expect(result.locatorState).toEqual({ kind: 'idle' })
    })
})
