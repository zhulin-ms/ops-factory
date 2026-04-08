import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import MessageList from '../app/platform/chat/MessageList'
import { UserProvider } from '../app/platform/providers/UserContext'
import i18n from '../i18n'
import type { ChatMessage } from '../types/message'

function renderMessageList(messages: ChatMessage[]) {
    return render(
        <I18nextProvider i18n={i18n}>
            <UserProvider>
                <MessageList messages={messages} />
            </UserProvider>
        </I18nextProvider>
    )
}

describe('MessageList tool error rendering', () => {
    it('renders tool steps as error when toolResult.isError is true', () => {
        Element.prototype.scrollIntoView = () => {}

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
})
