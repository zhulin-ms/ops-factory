import { describe, expect, it } from 'vitest'
import {
    createSessionLocator,
    isValidSessionLocator,
    parseSessionLocatorFromSearchParams,
    SessionLocatorError,
} from '../utils/sessionLocator'

describe('sessionLocator', () => {
    it('creates a ready locator from complete values', () => {
        expect(createSessionLocator('session-1', 'kb-agent')).toEqual({
            sessionId: 'session-1',
            agentId: 'kb-agent',
        })
    })

    it('rejects incomplete locators during creation', () => {
        expect(() => createSessionLocator('session-1', '')).toThrow(SessionLocatorError)
        expect(() => createSessionLocator('', 'kb-agent')).toThrow('Session locator is incomplete')
    })

    it('validates only complete locators', () => {
        expect(isValidSessionLocator({ sessionId: 'session-1', agentId: 'kb-agent' })).toBe(true)
        expect(isValidSessionLocator({ sessionId: 'session-1' })).toBe(false)
        expect(isValidSessionLocator({ agentId: 'kb-agent' })).toBe(false)
        expect(isValidSessionLocator(null)).toBe(false)
    })

    it('parses idle state when no locator is present in url', () => {
        const state = parseSessionLocatorFromSearchParams(new URLSearchParams(''))
        expect(state).toEqual({ kind: 'idle' })
    })

    it('parses recovering state when session id exists without agent id', () => {
        const state = parseSessionLocatorFromSearchParams(new URLSearchParams('sessionId=session-1'))
        expect(state).toEqual({
            kind: 'recovering',
            sessionId: 'session-1',
            hintedAgentId: null,
        })
    })

    it('parses corrupted state when agent id exists without session id', () => {
        const state = parseSessionLocatorFromSearchParams(new URLSearchParams('agent=kb-agent'))
        expect(state.kind).toBe('corrupted')
        if (state.kind === 'corrupted') {
            expect(state.reason).toContain('session id is missing')
        }
    })

    it('parses ready state when both session id and agent id are present', () => {
        const state = parseSessionLocatorFromSearchParams(new URLSearchParams('sessionId=session-1&agent=kb-agent'))
        expect(state).toEqual({
            kind: 'ready',
            locator: {
                sessionId: 'session-1',
                agentId: 'kb-agent',
            },
        })
    })
})
