import { describe, expect, it } from 'vitest'
import { getReasoningContent, getThinkingContent } from '../utils/messageContent'
import type { ChatMessage } from '../types/message'

describe('Message thinking content helpers', () => {
    it('extracts structured reasoning content for the thinking panel', () => {
        const message: ChatMessage = {
            id: 'assistant-1',
            role: 'assistant',
            content: [
                { type: 'reasoning', text: 'first chunk' },
                { type: 'reasoning', text: '\nsecond chunk' },
            ],
        }

        expect(getReasoningContent(message)).toBe('first chunk\nsecond chunk')
    })

    it('extracts structured thinking content before falling back to think tags', () => {
        const structuredMessage: ChatMessage = {
            id: 'assistant-2',
            role: 'assistant',
            content: [
                { type: 'thinking', thinking: 'structured thought' },
                { type: 'text', text: '<think>fallback thought</think>' },
            ],
        }

        const taggedMessage: ChatMessage = {
            id: 'assistant-3',
            role: 'assistant',
            content: [
                { type: 'text', text: 'Answer\n<think>fallback thought</think>' },
            ],
        }

        expect(getThinkingContent(structuredMessage)).toBe('structured thought')
        expect(getThinkingContent(taggedMessage)).toBe('fallback thought')
    })
})
