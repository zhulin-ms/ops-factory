import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import type { ComponentProps } from 'react'
import MessageList from '../app/platform/chat/MessageList'
import { UserProvider } from '../app/platform/providers/UserContext'
import i18n from '../i18n'
import type { ChatMessage } from '../types/message'

function renderMessageList(messages: ChatMessage[], props: Partial<ComponentProps<typeof MessageList>> = {}) {
    return render(
        <I18nextProvider i18n={i18n}>
            <UserProvider>
                <MessageList messages={messages} {...props} />
            </UserProvider>
        </I18nextProvider>
    )
}

describe('MessageList tool error rendering', () => {
    const originalScrollIntoView = Element.prototype.scrollIntoView
    const originalRequestAnimationFrame = window.requestAnimationFrame
    const originalCancelAnimationFrame = window.cancelAnimationFrame

    beforeEach(() => {
        Element.prototype.scrollIntoView = () => {}
        window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
            callback(0)
            return 1
        }) as typeof window.requestAnimationFrame
        window.cancelAnimationFrame = (() => {}) as typeof window.cancelAnimationFrame
    })

    afterEach(() => {
        Element.prototype.scrollIntoView = originalScrollIntoView
        window.requestAnimationFrame = originalRequestAnimationFrame
        window.cancelAnimationFrame = originalCancelAnimationFrame
    })

    it('renders tool steps as error when toolResult.isError is true', () => {

        const messages: ChatMessage[] = [
            {
                id: 'assistant-tool-request',
                role: 'assistant',
                content: [
                    {
                        type: 'toolRequest',
                        id: 'tool-1',
                        toolCall: {
                            status: 'completed',
                            value: {
                                name: 'developer__extension_manager',
                                arguments: {
                                    action: 'enable',
                                    extension_name: 'control_center',
                                },
                            },
                        },
                    },
                ],
            },
            {
                id: 'assistant-tool-response',
                role: 'assistant',
                content: [
                    {
                        type: 'toolResponse',
                        id: 'tool-1',
                        toolResult: {
                            isError: true,
                            value: {
                                content: [
                                    {
                                        type: 'text',
                                        text: 'Extension operation failed',
                                    },
                                ],
                            },
                        },
                    },
                ],
            },
        ]

        const { container } = renderMessageList(messages)
        const errorNode = container.querySelector('.process-step-node.error')
        expect(errorNode).toBeTruthy()
    })

    it('scrolls to bottom again when a resumed session changes with the same message count', async () => {
        const scrollContainer = document.createElement('div')
        Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 600 })
        Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 200 })
        Object.defineProperty(scrollContainer, 'scrollTop', {
            configurable: true,
            get: () => 0,
        })
        scrollContainer.scrollTo = vi.fn()

        const firstSessionMessages: ChatMessage[] = [
            {
                id: 'user-1',
                role: 'user',
                content: [{ type: 'text', text: 'First session' }],
            },
            {
                id: 'assistant-1',
                role: 'assistant',
                content: [{ type: 'text', text: 'Reply one' }],
            },
        ]

        const secondSessionMessages: ChatMessage[] = [
            {
                id: 'user-2',
                role: 'user',
                content: [{ type: 'text', text: 'Second session' }],
            },
            {
                id: 'assistant-2',
                role: 'assistant',
                content: [{ type: 'text', text: 'Reply two' }],
            },
        ]

        const view = renderMessageList(firstSessionMessages, {
            agentId: 'agent-a',
            sessionId: 'session-a',
            scrollContainerRef: { current: scrollContainer },
        })

        await waitFor(() => {
            expect(scrollContainer.scrollTo).toHaveBeenCalledTimes(1)
        })

        view.rerender(
            <I18nextProvider i18n={i18n}>
                <UserProvider>
                    <MessageList
                        messages={secondSessionMessages}
                        agentId="agent-a"
                        sessionId="session-b"
                        scrollContainerRef={{ current: scrollContainer }}
                    />
                </UserProvider>
            </I18nextProvider>
        )

        await waitFor(() => {
            expect(scrollContainer.scrollTo).toHaveBeenCalledTimes(2)
        })
    })

    it('falls back to the document scroll root when the provided message container does not overflow', async () => {
        const scrollContainer = document.createElement('div')
        Object.defineProperty(scrollContainer, 'scrollHeight', { configurable: true, value: 600 })
        Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 600 })
        Object.defineProperty(scrollContainer, 'scrollTop', {
            configurable: true,
            get: () => 0,
        })
        scrollContainer.scrollTo = vi.fn()

        const scrollRoot = document.createElement('div')
        Object.defineProperty(scrollRoot, 'scrollHeight', { configurable: true, value: 1200 })
        Object.defineProperty(scrollRoot, 'clientHeight', { configurable: true, value: 600 })
        let rootScrollTop = 0
        Object.defineProperty(scrollRoot, 'scrollTop', {
            configurable: true,
            get: () => rootScrollTop,
            set: (value: number) => { rootScrollTop = value },
        })
        scrollRoot.scrollTo = vi.fn(({ top }: ScrollToOptions) => {
            rootScrollTop = Number(top ?? 0)
        })

        const originalScrollingElement = Object.getOwnPropertyDescriptor(document, 'scrollingElement')
        Object.defineProperty(document, 'scrollingElement', {
            configurable: true,
            value: scrollRoot,
        })

        const messages: ChatMessage[] = [
            {
                id: 'user-1',
                role: 'user',
                content: [{ type: 'text', text: 'Hello' }],
            },
            {
                id: 'assistant-1',
                role: 'assistant',
                content: [{ type: 'text', text: 'Hi there' }],
            },
        ]

        renderMessageList(messages, {
            agentId: 'agent-a',
            sessionId: 'session-a',
            scrollContainerRef: { current: scrollContainer },
        })

        await waitFor(() => {
            expect(scrollContainer.scrollTo).not.toHaveBeenCalled()
            expect(scrollRoot.scrollTo).toHaveBeenCalledTimes(1)
        })

        if (originalScrollingElement) {
            Object.defineProperty(document, 'scrollingElement', originalScrollingElement)
        } else {
            // @ts-expect-error test cleanup for configurable property
            delete document.scrollingElement
        }
    })

    it('falls back to the document scroll root when no message container is provided', async () => {
        const scrollRoot = document.createElement('div')
        Object.defineProperty(scrollRoot, 'scrollHeight', { configurable: true, value: 1200 })
        Object.defineProperty(scrollRoot, 'clientHeight', { configurable: true, value: 600 })
        let rootScrollTop = 0
        Object.defineProperty(scrollRoot, 'scrollTop', {
            configurable: true,
            get: () => rootScrollTop,
            set: (value: number) => { rootScrollTop = value },
        })
        scrollRoot.scrollTo = vi.fn(({ top }: ScrollToOptions) => {
            rootScrollTop = Number(top ?? 0)
        })

        const originalScrollingElement = Object.getOwnPropertyDescriptor(document, 'scrollingElement')
        Object.defineProperty(document, 'scrollingElement', {
            configurable: true,
            value: scrollRoot,
        })

        const messages: ChatMessage[] = [
            {
                id: 'user-1',
                role: 'user',
                content: [{ type: 'text', text: 'Hello' }],
            },
            {
                id: 'assistant-1',
                role: 'assistant',
                content: [{ type: 'text', text: 'Hi there' }],
            },
        ]

        renderMessageList(messages, {
            agentId: 'agent-a',
            sessionId: 'session-a',
        })

        await waitFor(() => {
            expect(scrollRoot.scrollTo).toHaveBeenCalledTimes(1)
        })

        if (originalScrollingElement) {
            Object.defineProperty(document, 'scrollingElement', originalScrollingElement)
        } else {
            // @ts-expect-error test cleanup for configurable property
            delete document.scrollingElement
        }
    })

})
