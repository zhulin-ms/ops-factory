import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGoosed } from '../../../platform/providers/GoosedContext'
import { useInbox } from '../../../platform/providers/InboxContext'
import { useToast } from '../../../platform/providers/ToastContext'
import {
    buildChatSessionState,
    clearPersistedChatSessionLocator,
    persistChatSessionLocator,
    resolveChatRouteState,
} from '../../../platform/chat/chatRouteState'
import { useChat, convertBackendMessage } from '../../../platform/chat/useChat'
import MessageList from '../../../platform/chat/MessageList'
import ChatInput from '../../../platform/chat/ChatInput'
import ChatPanelShell from '../../../platform/chat/ChatPanelShell'
import type { Session, ImageData } from '@goosed/sdk'
import type { AttachedFile } from '../../../../types/message'
import { isScheduledSession } from '../../../../config/runtime'
import {
    createSessionLocator,
    SessionLocatorError,
    type SessionLocatorState,
} from '../../../../utils/sessionLocator'
import '../styles/chat.css'

interface ModelInfo {
    provider: string
    model: string
}

const BOTTOM_THRESHOLD_PX = 24
const USER_MESSAGE_TOP_ANCHOR_PX = 24
const USER_MESSAGE_TOP_TOLERANCE_PX = 12
const BOTTOM_CONTENT_GAP_PX = 24

function setScrollTop(element: HTMLElement, top: number, behavior: ScrollBehavior) {
    if (typeof element.scrollTo === 'function') {
        element.scrollTo({ top, behavior })
        return
    }

    element.scrollTop = top
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

    const routeResolution = useMemo(
        () => resolveChatRouteState(searchParams, location.state),
        [searchParams, location.state],
    )
    const routeLocatorState = routeResolution.locatorState

    const [locatorState, setLocatorState] = useState<SessionLocatorState>(routeLocatorState)
    const [session, setSession] = useState<Session | null>(null)
    const [isInitializing, setIsInitializing] = useState(true)
    const [initError, setInitError] = useState<string | null>(null)
    const [isCreatingSession, setIsCreatingSession] = useState(false)
    const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)
    const [showStopHint, setShowStopHint] = useState(false)
    const [pendingUserMessageAnchorId, setPendingUserMessageAnchorId] = useState<string | null>(null)
    const [showScrollToBottom, setShowScrollToBottom] = useState(false)
    const stopHintTimerRef = useRef<number | null>(null)
    const messageScrollContainerRef = useRef<HTMLDivElement>(null)

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

    const initialMessage = routeResolution.initialMessage
    const preferredAgentId = routeResolution.preferredAgentId

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

    const createSessionWithAgent = useCallback(async (agentId: string, options: { initialMessage?: string } = {}) => {
        setIsCreatingSession(true)
        try {
            const agentClient = getClient(agentId)
            const newSession = await agentClient.startSession()
            const nextLocator = createSessionLocator(newSession.id, agentId)
            setSession(newSession)
            setLocatorState({ kind: 'ready', locator: nextLocator })
            persistChatSessionLocator(nextLocator)
            clearMessages()
            navigate('/chat', {
                replace: true,
                state: buildChatSessionState(newSession.id, agentId, { initialMessage: options.initialMessage }),
            })
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
        if (locatorState.kind === 'ready') {
            persistChatSessionLocator(locatorState.locator)
        }
    }, [locatorState])

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
                const fallbackAgentId = (
                    preferredAgentId && agents.some(agent => agent.id === preferredAgentId)
                        ? preferredAgentId
                        : agents.find(agent => agent.id === 'universal-agent')?.id || agents[0]?.id || ''
                )

                if (!fallbackAgentId) {
                    clearMessages()
                    setSession(null)
                    setInitError('No agent available to start a chat session')
                    setIsInitializing(false)
                    return
                }

                const createdSession = await createSessionWithAgent(fallbackAgentId, { initialMessage })
                if (!createdSession && !cancelled) {
                    setIsInitializing(false)
                }
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
                persistChatSessionLocator(nextLocator)
                if (
                    routeResolution.source !== 'state' ||
                    routeLocatorState.kind !== 'ready' ||
                    routeLocatorState.locator.sessionId !== nextLocator.sessionId ||
                    routeLocatorState.locator.agentId !== nextLocator.agentId
                ) {
                    navigate('/chat', {
                        replace: true,
                        state: buildChatSessionState(activeSessionId, ownerAgentId),
                    })
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
                    if (isNotFoundError(err) && routeResolution.source === 'storage') {
                        clearPersistedChatSessionLocator()
                        setLocatorState({ kind: 'idle' })
                        setSession(null)
                        setInitError(null)
                        return
                    }
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
    }, [
        getClient,
        isConnected,
        activeSessionId,
        readyLocator,
        locatorState,
        agents,
        setInitialMessages,
        clearMessages,
        navigate,
        markSessionRead,
        routeResolution,
        routeLocatorState,
        preferredAgentId,
        initialMessage,
        createSessionWithAgent,
    ])

    useEffect(() => {
        if (initialMessage && locatorState.kind === 'ready' && activeSessionId && !isInitializing && messages.length === 0) {
            const messageId = sendMessage(initialMessage)
            if (messageId) {
                setPendingUserMessageAnchorId(messageId)
            }
            navigate('/chat', {
                replace: true,
                state: buildChatSessionState(activeSessionId, activeAgentId),
            })
        }
    }, [initialMessage, locatorState, activeSessionId, activeAgentId, isInitializing, messages.length, sendMessage, navigate])

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
        const messageId = sendMessage(text, images, attachedFiles)
        if (messageId) {
            setPendingUserMessageAnchorId(messageId)
        }
    }, [activeSessionId, locatorState, sendMessage])

    const resolveActiveScrollElement = useCallback((): HTMLElement => {
        const scrollContainer = messageScrollContainerRef.current
        if (scrollContainer && scrollContainer.scrollHeight - scrollContainer.clientHeight > BOTTOM_THRESHOLD_PX) {
            return scrollContainer
        }

        return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : document.documentElement
    }, [])

    const getCurrentScrollTop = useCallback((element: HTMLElement): number => {
        return element === document.scrollingElement || element === document.documentElement || element === document.body
            ? window.scrollY
            : element.scrollTop
    }, [])

    const getMaxScrollTop = useCallback((element: HTMLElement): number => {
        return Math.max(element.scrollHeight - element.clientHeight, 0)
    }, [])

    const getBottomAnchorTop = useCallback((): number => {
        const inputInner = document.querySelector('.chat-input-area-bottom .chat-input-area-inner') as HTMLElement | null
        return inputInner ? inputInner.getBoundingClientRect().top - BOTTOM_CONTENT_GAP_PX : window.innerHeight - 180
    }, [])

    const getLastConversationElement = useCallback((): HTMLElement | null => {
        const messageRoot = document.querySelector('.chat-messages') as HTMLElement | null
        if (!messageRoot) return null

        const elements = Array.from(messageRoot.querySelectorAll('[data-message-id]'))
        return (elements[elements.length - 1] as HTMLElement | undefined) ?? null
    }, [])

    const getBottomScrollTarget = useCallback((): number => {
        const activeScrollElement = resolveActiveScrollElement()
        const lastElement = getLastConversationElement()
        if (!lastElement) return activeScrollElement.scrollHeight

        const currentTop = getCurrentScrollTop(activeScrollElement)
        const anchorBottomTop = getBottomAnchorTop()
        const delta = lastElement.getBoundingClientRect().bottom - anchorBottomTop

        return Math.max(currentTop + delta, 0)
    }, [getBottomAnchorTop, getCurrentScrollTop, getLastConversationElement, resolveActiveScrollElement])

    const getClampedBottomScrollTarget = useCallback((): number => {
        const activeScrollElement = resolveActiveScrollElement()
        return Math.min(getBottomScrollTarget(), getMaxScrollTop(activeScrollElement))
    }, [getBottomScrollTarget, getMaxScrollTop, resolveActiveScrollElement])

    const updateScrollToBottomVisibility = useCallback(() => {
        const activeScrollElement = resolveActiveScrollElement()
        const lastElement = getLastConversationElement()
        if (!lastElement) {
            setShowScrollToBottom(false)
            return
        }

        const currentTop = getCurrentScrollTop(activeScrollElement)
        const remainingScrollableDistance = Math.max(getMaxScrollTop(activeScrollElement) - currentTop, 0)
        const distancePastBottomAnchor = Math.max(lastElement.getBoundingClientRect().bottom - getBottomAnchorTop(), 0)

        setShowScrollToBottom(
            remainingScrollableDistance > BOTTOM_THRESHOLD_PX &&
            distancePastBottomAnchor > BOTTOM_THRESHOLD_PX
        )
    }, [getBottomAnchorTop, getCurrentScrollTop, getLastConversationElement, getMaxScrollTop, resolveActiveScrollElement])

    useEffect(() => {
        updateScrollToBottomVisibility()

        const scrollContainer = messageScrollContainerRef.current

        if (scrollContainer) {
            scrollContainer.addEventListener('scroll', updateScrollToBottomVisibility, { passive: true })
        }
        window.addEventListener('scroll', updateScrollToBottomVisibility, { passive: true })
        window.addEventListener('resize', updateScrollToBottomVisibility)

        return () => {
            if (scrollContainer) {
                scrollContainer.removeEventListener('scroll', updateScrollToBottomVisibility)
            }
            window.removeEventListener('scroll', updateScrollToBottomVisibility)
            window.removeEventListener('resize', updateScrollToBottomVisibility)
        }
    }, [updateScrollToBottomVisibility])

    useEffect(() => {
        const frame = window.requestAnimationFrame(() => {
            updateScrollToBottomVisibility()
        })

        return () => window.cancelAnimationFrame(frame)
    }, [messages, isLoading, session?.id, updateScrollToBottomVisibility])

    useEffect(() => {
        if (!pendingUserMessageAnchorId) return
        if (!messages.some(message => message.id === pendingUserMessageAnchorId && message.role === 'user')) return

        const frame = window.requestAnimationFrame(() => {
            const activeScrollElement = resolveActiveScrollElement()
            const targetElement = document.querySelector(`[data-message-id="${pendingUserMessageAnchorId}"]`) as HTMLElement | null

            if (!targetElement) return

            const anchorTop = USER_MESSAGE_TOP_ANCHOR_PX
            const currentTop =
                activeScrollElement === document.scrollingElement ||
                activeScrollElement === document.documentElement ||
                activeScrollElement === document.body
                    ? window.scrollY
                    : activeScrollElement.scrollTop
            const targetRect = targetElement.getBoundingClientRect()
            const delta = targetRect.top - anchorTop
            const isAnchored = Math.abs(delta) <= USER_MESSAGE_TOP_TOLERANCE_PX

            if (isAnchored) {
                setPendingUserMessageAnchorId(null)
                return
            }

            setScrollTop(activeScrollElement, Math.max(currentTop + delta, 0), 'smooth')
        })

        return () => window.cancelAnimationFrame(frame)
    }, [activeSessionId, isLoading, messages, pendingUserMessageAnchorId, resolveActiveScrollElement])

    useEffect(() => {
        if (!pendingUserMessageAnchorId) return

        const activeScrollElement = resolveActiveScrollElement()
        let frame: number | null = null

        const completeAnchorIfSettled = () => {
            frame = null
            const targetElement = document.querySelector(`[data-message-id="${pendingUserMessageAnchorId}"]`) as HTMLElement | null
            if (!targetElement) return

            const currentTop = getCurrentScrollTop(activeScrollElement)
            const maxScrollTop = getMaxScrollTop(activeScrollElement)
            const delta = targetElement.getBoundingClientRect().top - USER_MESSAGE_TOP_ANCHOR_PX
            const isAnchored = Math.abs(delta) <= USER_MESSAGE_TOP_TOLERANCE_PX
            const isAtScrollLimit = Math.abs(maxScrollTop - currentTop) <= USER_MESSAGE_TOP_TOLERANCE_PX

            if (isAnchored || isAtScrollLimit) {
                setPendingUserMessageAnchorId(null)
            }
        }

        const scheduleCheck = () => {
            if (frame !== null) {
                window.cancelAnimationFrame(frame)
            }
            frame = window.requestAnimationFrame(completeAnchorIfSettled)
        }

        activeScrollElement.addEventListener('scroll', scheduleCheck, { passive: true })
        scheduleCheck()

        return () => {
            activeScrollElement.removeEventListener('scroll', scheduleCheck)
            if (frame !== null) {
                window.cancelAnimationFrame(frame)
            }
        }
    }, [getCurrentScrollTop, getMaxScrollTop, pendingUserMessageAnchorId, resolveActiveScrollElement])

    const handleJumpToBottom = useCallback(() => {
        const activeScrollElement = resolveActiveScrollElement()
        const bottomTarget = getClampedBottomScrollTarget()

        activeScrollElement.scrollTo({
            top: bottomTarget,
            behavior: 'smooth',
        })
    }, [getClampedBottomScrollTarget, resolveActiveScrollElement])

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
                    const messageId = sendMessage(text)
                    if (messageId) {
                        setPendingUserMessageAnchorId(messageId)
                    }
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

    const sessionTitle = session?.name?.trim() || t('sidebar.newChat')

    return (
        <div className="chat-container">
            <ChatPanelShell
                className="chat-main-panel"
                scrollBody={false}
                header={(
                    <div className="chat-session-header">
                        <span className="chat-session-title">{sessionTitle}</span>
                    </div>
                )}
            >
                {/* Messages area - scrollable */}
                <div className="chat-messages-area" ref={messageScrollContainerRef}>
                    <div className="chat-messages-scroll">
                        <MessageList
                            messages={messages}
                            isLoading={isLoading}
                            chatState={chatState}
                            agentId={activeAgentId}
                            sessionId={activeSessionId || undefined}
                            outputFilesEvent={outputFilesEvent}
                            onRetry={handleRetry}
                            scrollContainerRef={messageScrollContainerRef}
                            showAnchorSpacer={!!pendingUserMessageAnchorId}
                        />
                    </div>
                </div>
            </ChatPanelShell>

            {/* Input at bottom - floating */}
            <div className="chat-input-area-bottom">
                <div className="chat-input-area-inner">
                    {showScrollToBottom && (
                        <div className="chat-scroll-bottom-action">
                            <button
                                type="button"
                                className="chat-scroll-bottom-button"
                                onClick={handleJumpToBottom}
                                aria-label={t('chat.jumpToBottom')}
                                title={t('chat.jumpToBottom')}
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" aria-hidden="true">
                                    <path d="M12 5v12" />
                                    <path d="m6 13 6 6 6-6" />
                                </svg>
                            </button>
                        </div>
                    )}
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
