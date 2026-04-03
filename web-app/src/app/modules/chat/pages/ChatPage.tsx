import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGoosed } from '../../../../contexts/GoosedContext'
import { useInbox } from '../../../../contexts/InboxContext'
import { useToast } from '../../../../contexts/ToastContext'
import { useChat, convertBackendMessage } from '../../../../hooks/useChat'
import MessageList from '../../../../components/MessageList'
import ChatInput from '../../../../components/ChatInput'
import type { Session, ImageData } from '@goosed/sdk'
import type { AttachedFile } from '../../../../types/message'
import { isScheduledSession } from '../../../../config/runtime'
import {
    createSessionLocator,
    parseSessionLocatorFromSearchParams,
    SessionLocatorError,
    type SessionLocatorState,
} from '../../../../utils/sessionLocator'
import '../styles/chat.css'

interface LocationState {
    initialMessage?: string
}

interface ModelInfo {
    provider: string
    model: string
}

function isNotFoundError(error: unknown): boolean {
    return error instanceof Error && error.name === 'GoosedNotFoundError'
}

export default function Chat() {
    const { t } = useTranslation()
    const [searchParams] = useSearchParams()
    const location = useLocation()
    const navigate = useNavigate()
    const { getClient, agents, isConnected, error: goosedError } = useGoosed()
    const { markSessionRead } = useInbox()
    const { showToast } = useToast()

    const sessionId = searchParams.get('sessionId')
    const agentParam = searchParams.get('agent')
    const routeLocatorState = parseSessionLocatorFromSearchParams(searchParams)

    const [locatorState, setLocatorState] = useState<SessionLocatorState>(routeLocatorState)
    const [session, setSession] = useState<Session | null>(null)
    const [isInitializing, setIsInitializing] = useState(true)
    const [initError, setInitError] = useState<string | null>(null)
    const [isCreatingSession, setIsCreatingSession] = useState(false)
    const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)
    const [showStopHint, setShowStopHint] = useState(false)
    const stopHintTimerRef = useRef<number | null>(null)

    useEffect(() => {
        setLocatorState((current) => {
            if (current.kind === routeLocatorState.kind) {
                if (current.kind === 'idle' || current.kind === 'corrupted') {
                    return current
                }
                if (current.kind === 'recovering' && routeLocatorState.kind === 'recovering' &&
                    current.sessionId === routeLocatorState.sessionId &&
                    current.hintedAgentId === routeLocatorState.hintedAgentId) {
                    return current
                }
                if (current.kind === 'ready' && routeLocatorState.kind === 'ready' &&
                    current.locator.sessionId === routeLocatorState.locator.sessionId &&
                    current.locator.agentId === routeLocatorState.locator.agentId) {
                    return current
                }
            }

            if (current.kind === 'ready' && routeLocatorState.kind === 'recovering' &&
                current.locator.sessionId === routeLocatorState.sessionId) {
                return current
            }

            return routeLocatorState
        })
    }, [routeLocatorState])

    const readyLocator = locatorState.kind === 'ready' ? locatorState.locator : null
    const recoverySessionId = locatorState.kind === 'recovering' ? locatorState.sessionId : ''
    const activeSessionId = readyLocator?.sessionId || recoverySessionId
    const activeAgentId = readyLocator?.agentId || ''
    const client = activeAgentId ? getClient(activeAgentId) : null

    const { messages, chatState, isLoading, error, tokenState, outputFilesEvent, sendMessage, stopMessage, clearMessages, setInitialMessages } = useChat({
        sessionId: activeSessionId || null,
        client: client!,
    })

    useEffect(() => {
        if (error) {
            // Map gateway timeout/connection errors to localized warning toasts
            if (/No response from agent/i.test(error)) {
                showToast('warning', t('chat.agentNoResponse'))
            } else if (/Agent stopped responding/i.test(error)) {
                showToast('warning', t('chat.agentIdleTimeout'))
            } else if (/Agent connection (failed|lost)/i.test(error)) {
                showToast('warning', t('chat.agentConnectionLost'))
            } else {
                showToast('error', error)
            }
        }
    }, [error, showToast, t])

    const locationState = location.state as LocationState | null
    const initialMessage = locationState?.initialMessage

    useEffect(() => {
        const fetchModelInfo = async () => {
            if (!isConnected || !client) return
            try {
                const systemInfo = await client.systemInfo()
                if (systemInfo.provider && systemInfo.model) {
                    setModelInfo({ provider: systemInfo.provider, model: systemInfo.model })
                }
            } catch (err) {
                console.error('Failed to fetch model info:', err)
            }
        }
        fetchModelInfo()
    }, [client, isConnected])

    const createSessionWithAgent = useCallback(async (agentId: string) => {
        setIsCreatingSession(true)
        try {
            const agentClient = getClient(agentId)
            const newSession = await agentClient.startSession()
            setSession(newSession)
            setLocatorState({ kind: 'ready', locator: createSessionLocator(newSession.id, agentId) })
            clearMessages()
            navigate(`/chat?sessionId=${newSession.id}&agent=${agentId}`, { replace: true })
            return newSession
        } catch (err) {
            console.error('Failed to create session:', err)
            setInitError(err instanceof Error ? err.message : 'Failed to create session')
            return null
        } finally {
            setIsCreatingSession(false)
        }
    }, [getClient, clearMessages, navigate])

    const handleAgentChange = useCallback(async (agentId: string) => {
        if (agentId === activeAgentId) return
        await createSessionWithAgent(agentId)
    }, [activeAgentId, createSessionWithAgent])

    useEffect(() => {
        let cancelled = false

        const resumeSessionForAgent = async (agentId: string) => {
            const agentClient = getClient(agentId)
            const resumeResult = await agentClient.resumeSession(activeSessionId)
            return { agentId, resumeResult }
        }

        const findSessionOwner = async () => {
            let notFoundError: Error | null = null
            const hintedAgentId = readyLocator?.agentId || (locatorState.kind === 'recovering' ? locatorState.hintedAgentId : null)
            const candidateAgentIds = hintedAgentId
                ? [hintedAgentId, ...agents.map(agent => agent.id).filter(agentId => agentId !== hintedAgentId)]
                : agents.map(agent => agent.id)

            for (const agentId of candidateAgentIds) {
                try {
                    return await resumeSessionForAgent(agentId)
                } catch (err) {
                    if (isNotFoundError(err)) {
                        notFoundError = err instanceof Error ? err : new Error('Resource not found')
                        continue
                    }
                    throw err
                }
            }

            throw notFoundError ?? new Error('Failed to load session')
        }

        const initSession = async () => {
            if (!isConnected || agents.length === 0) return

            if (locatorState.kind === 'idle') {
                clearMessages()
                setSession(null)
                setInitError(null)
                setIsInitializing(false)
                navigate('/', { replace: true })
                return
            }

            if (locatorState.kind === 'corrupted') {
                clearMessages()
                setSession(null)
                setInitError(locatorState.reason)
                setIsInitializing(false)
                return
            }

            if (!activeSessionId) {
                return
            }

            if (!cancelled) {
                setIsInitializing(true)
                setInitError(null)
            }

            try {
                const { agentId: ownerAgentId, resumeResult } = await findSessionOwner()
                const resumedSession = resumeResult.session

                if (cancelled) return

                const nextLocator = createSessionLocator(activeSessionId, ownerAgentId)
                setLocatorState((current) => {
                    if (current.kind === 'ready' &&
                        current.locator.sessionId === nextLocator.sessionId &&
                        current.locator.agentId === nextLocator.agentId) {
                        return current
                    }

                    return { kind: 'ready', locator: nextLocator }
                })
                if (agentParam !== ownerAgentId) {
                    navigate(`/chat?sessionId=${activeSessionId}&agent=${ownerAgentId}`, { replace: true })
                }
                setSession(resumedSession)

                // Auto-mark scheduled sessions as read when viewed
                if (isScheduledSession(resumedSession)) {
                    markSessionRead(ownerAgentId, activeSessionId)
                }

                if (resumedSession.conversation && Array.isArray(resumedSession.conversation)) {
                    const historyMessages = resumedSession.conversation.map(msg =>
                        convertBackendMessage(msg as Record<string, unknown>)
                    )
                    setInitialMessages(historyMessages)
                }
            } catch (err) {
                console.error('Failed to initialize session:', err)
                if (!cancelled) {
                    const message = err instanceof Error ? err.message : 'Failed to load session'
                    if (err instanceof SessionLocatorError) {
                        setLocatorState({ kind: 'corrupted', reason: message, rawValue: locatorState })
                    }
                    setInitError(message)
                }
            } finally {
                if (!cancelled) {
                    setIsInitializing(false)
                }
            }
        }
        void initSession()

        return () => {
            cancelled = true
        }
    }, [getClient, isConnected, activeSessionId, readyLocator, locatorState, agentParam, agents, setInitialMessages, clearMessages, navigate, markSessionRead])

    useEffect(() => {
        if (initialMessage && locatorState.kind === 'ready' && activeSessionId && !isInitializing && messages.length === 0) {
            sendMessage(initialMessage)
            window.history.replaceState({}, document.title)
        }
    }, [initialMessage, locatorState, activeSessionId, isInitializing, messages.length, sendMessage])

    useEffect(() => {
        return () => {
            if (stopHintTimerRef.current !== null) {
                window.clearTimeout(stopHintTimerRef.current)
                stopHintTimerRef.current = null
            }
        }
    }, [])

    const handleSendMessage = useCallback((text: string, images?: ImageData[], attachedFiles?: AttachedFile[]) => {
        if (locatorState.kind !== 'ready') {
            throw new SessionLocatorError('Session locator is not ready for sending messages', locatorState)
        }
        if (stopHintTimerRef.current !== null) {
            window.clearTimeout(stopHintTimerRef.current)
            stopHintTimerRef.current = null
        }
        setShowStopHint(false)
        sendMessage(text, images, attachedFiles)
    }, [locatorState, sendMessage])

    const handleUploadFile = useCallback(async (file: File): Promise<{ path: string }> => {
        if (locatorState.kind !== 'ready' || !client || !activeSessionId) {
            throw new Error('No active session for file upload')
        }
        const result = await client.uploadFile(file, activeSessionId)
        return { path: result.path }
    }, [locatorState, client, activeSessionId])

    const handleRetry = useCallback(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i]
            if (msg.role === 'user') {
                const textContent = msg.content.find(c => c.type === 'text')
                const text = textContent && 'text' in textContent ? textContent.text : undefined
                if (text) {
                    sendMessage(text)
                    return
                }
            }
        }
    }, [messages, sendMessage])

    const handleStopMessage = useCallback(async () => {
        const stopped = await stopMessage()
        if (stopped) {
            setShowStopHint(true)
            if (stopHintTimerRef.current !== null) {
                window.clearTimeout(stopHintTimerRef.current)
            }
            stopHintTimerRef.current = window.setTimeout(() => {
                setShowStopHint(false)
            }, 2200)
        }
    }, [stopMessage])

    if (locatorState.kind === 'corrupted') {
        return (
            <div className="chat-container">
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="empty-state">
                        <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <h3 className="empty-state-title">{t('chat.failedToLoadSession')}</h3>
                        <p className="empty-state-description">{locatorState.reason}</p>
                        <button className="btn btn-primary" style={{ marginTop: 'var(--spacing-4)' }} onClick={() => navigate('/history')}>
                            {t('history.title')}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    if (isInitializing && !isConnected && goosedError) {
        return (
            <div className="chat-container">
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="empty-state">
                        <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <h3 className="empty-state-title">{t('chat.failedToLoadSession')}</h3>
                        <p className="empty-state-description">{goosedError}</p>
                        <button className="btn btn-primary" style={{ marginTop: 'var(--spacing-4)' }} onClick={() => navigate('/')}>
                            {t('chat.backToHome')}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    if (isInitializing) {
        const loadingText = locatorState.kind === 'recovering' ? t('chat.loadingSession') : t('chat.loadingSession')
        return (
            <div className="chat-container">
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div className="loading-spinner" style={{ margin: '0 auto var(--spacing-4)' }} />
                        <p style={{ color: 'var(--color-text-secondary)' }}>{loadingText}</p>
                    </div>
                </div>
            </div>
        )
    }

    if (initError) {
        return (
            <div className="chat-container">
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="empty-state">
                        <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <h3 className="empty-state-title">{t('chat.failedToLoadSession')}</h3>
                        <p className="empty-state-description">{initError}</p>
                        <button className="btn btn-primary" style={{ marginTop: 'var(--spacing-4)' }} onClick={() => navigate('/')}>
                            {t('chat.backToHome')}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="chat-container">
            {/* Session header */}
            {session?.name && (
                <div className="chat-session-header">
                    <span className="chat-session-title">{session.name}</span>
                </div>
            )}

            {/* Messages area - scrollable */}
            <div className="chat-messages-area">
                <div className="chat-messages-scroll">
                    <MessageList messages={messages} isLoading={isLoading} chatState={chatState} agentId={activeAgentId} sessionId={activeSessionId || sessionId} outputFilesEvent={outputFilesEvent} onRetry={handleRetry} />
                </div>
            </div>

            {/* Input at bottom - floating */}
            <div className="chat-input-area-bottom">
                <div className="chat-input-area-inner">
                    <div className={`chat-inline-hint ${showStopHint ? 'visible' : ''}`}>
                        {t('chat.generationStopped')}
                    </div>
                    <ChatInput
                        onSubmit={handleSendMessage}
                        onUploadFile={handleUploadFile}
                        disabled={locatorState.kind !== 'ready' || isLoading || !isConnected || isCreatingSession}
                        isGenerating={isLoading}
                        onStopGeneration={handleStopMessage}
                        placeholder={isCreatingSession ? t('chat.switchingAgent') : isLoading ? t('chat.waitingForResponse') : t('chat.typePlaceholder')}
                        autoFocus
                        selectedAgent={activeAgentId}
                        onAgentChange={handleAgentChange}
                        showAgentSelector={true}
                        modelInfo={modelInfo}
                        tokenState={tokenState}
                    />
                </div>
            </div>
        </div>
    )
}
