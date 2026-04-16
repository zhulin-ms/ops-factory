export interface TextContent {
    type: 'text'
    text: string
}

export interface ImageContent {
    type: 'image'
    data: string
    mimeType: string
}

export interface ToolRequestContent {
    type: 'toolRequest'
    id?: string
    toolCall?: {
        status?: string
        value?: {
            name?: string
            arguments?: Record<string, unknown>
        }
    }
}

export interface ToolResponseContent {
    type: 'toolResponse'
    id?: string
    toolResult?: {
        status?: string
        isError?: boolean
        value?: unknown
    }
}

export interface ReasoningContent {
    type: 'reasoning'
    text: string
}

export interface ThinkingContent {
    type: 'thinking'
    thinking: string
    signature?: string
}

export interface RedactedThinkingContent {
    type: 'redactedThinking'
    data: string
}

export interface SystemNotificationContent {
    type: 'systemNotification'
    notificationType?: string
    msg?: string
}

export interface GenericContent {
    type: string
    text?: string
    data?: string
    mimeType?: string
    id?: string
    name?: string
    input?: Record<string, unknown>
    toolCall?: {
        status?: string
        value?: {
            name?: string
            arguments?: Record<string, unknown>
        }
    }
    toolResult?: {
        status?: string
        isError?: boolean
        value?: unknown
    }
    notificationType?: string
    msg?: string
    thinking?: string
    signature?: string
}

export type MessageContent =
    | TextContent
    | ImageContent
    | ToolRequestContent
    | ToolResponseContent
    | ReasoningContent
    | ThinkingContent
    | RedactedThinkingContent
    | SystemNotificationContent
    | GenericContent

export interface AttachedFile {
    name: string
    path: string
    ext: string
    serverPath?: string
}

export interface MessageMetadata {
    userVisible?: boolean
    agentVisible?: boolean
    attachedFiles?: AttachedFile[]
}

export interface ChatMessage {
    id?: string
    role: 'user' | 'assistant'
    content: MessageContent[]
    created?: number
    metadata?: MessageMetadata
}

export interface DetectedFile {
    path: string
    name: string
    ext: string
}

export type ToolResponseMap = Map<string, { result?: unknown; isError: boolean }>
