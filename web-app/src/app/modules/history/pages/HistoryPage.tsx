import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Session } from '@goosed/sdk'
import { useGoosed } from '../../../platform/providers/GoosedContext'
import { useInbox } from '../../../platform/providers/InboxContext'
import { useToast } from '../../../platform/providers/ToastContext'
import PageHeader from '../../../platform/ui/primitives/PageHeader'
import Pagination from '../../../platform/ui/primitives/Pagination'
import ListFooter from '../../../platform/ui/list/ListFooter'
import ListResultsMeta from '../../../platform/ui/list/ListResultsMeta'
import ListSearchInput from '../../../platform/ui/list/ListSearchInput'
import ListToolbar from '../../../platform/ui/list/ListToolbar'
import ListWorkbench from '../../../platform/ui/list/ListWorkbench'
import { buildChatSessionState } from '../../../platform/chat/chatRouteState'
import { isScheduledSession } from '../../../../config/runtime'
import RenameSessionDialog from '../components/RenameSessionDialog'
import SessionList, { type SessionWithAgent } from '../components/SessionList'
import '../styles/history.css'

interface AgentSession extends Session {
    agentId: string
}

type HistoryFilter = 'user' | 'scheduled' | 'all'

function parseHistoryFilter(raw: string | null): HistoryFilter {
    if (raw === 'scheduled' || raw === 'all' || raw === 'user') return raw
    return 'user'
}

export default function HistoryPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { showToast } = useToast()
    const [searchParams, setSearchParams] = useSearchParams()
    const { getClient, agents, isConnected, error: connectionError } = useGoosed()
    const { markSessionRead, markSessionUnread } = useInbox()
    const [sessions, setSessions] = useState<AgentSession[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [deletingSessionKeys, setDeletingSessionKeys] = useState<Set<string>>(new Set())
    const [renamingSession, setRenamingSession] = useState<SessionWithAgent | null>(null)
    const [isRenaming, setIsRenaming] = useState(false)
    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const historyFilter = parseHistoryFilter(searchParams.get('type'))
    const setHistoryFilter = useCallback((filter: HistoryFilter) => {
        const nextParams = new URLSearchParams(searchParams)
        if (filter === 'user') {
            nextParams.delete('type')
        } else {
            nextParams.set('type', filter)
        }
        setSearchParams(nextParams, { replace: true })
    }, [searchParams, setSearchParams])
    const [lastDeletedSessionId, setLastDeletedSessionId] = useState<string | null>(null)
    const [lastDeletedAt, setLastDeletedAt] = useState<number | null>(null)

    const getSessionKey = (session: SessionWithAgent) => `${session.agentId || 'unknown'}:${session.id}`

    useEffect(() => {
        let cancelled = false
        const loadSessions = async () => {
            if (!isConnected || agents.length === 0) {
                if (!cancelled) setIsLoading(false)
                return
            }

            setIsLoading(true)
            setError(null)

            try {
                const results = await Promise.allSettled(
                    agents.map(async (agent) => {
                        const client = getClient(agent.id)
                        const agentSessions = await client.listSessions()
                        return agentSessions.map((session: Session) => ({ ...session, agentId: agent.id }))
                    }),
                )

                const allSessions: AgentSession[] = []
                for (const result of results) {
                    if (result.status === 'fulfilled') {
                        allSessions.push(...result.value)
                    }
                }

                allSessions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                if (!cancelled) {
                    setSessions(allSessions)
                }
            } catch (err) {
                console.error('Failed to load sessions:', err)
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load sessions')
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false)
                }
            }
        }

        void loadSessions()
        return () => {
            cancelled = true
        }
    }, [getClient, agents, isConnected])

    const filteredByType = useMemo(() => {
        if (historyFilter === 'all') return sessions
        if (historyFilter === 'scheduled') {
            return sessions.filter((session) => isScheduledSession(session))
        }
        return sessions.filter((session) => (session.session_type || 'user') === 'user' && !session.schedule_id)
    }, [sessions, historyFilter])

    const filteredSessions = useMemo(() => {
        if (!searchTerm.trim()) return filteredByType

        const term = searchTerm.toLowerCase()
        return filteredByType.filter((session) =>
            session.name.toLowerCase().includes(term) ||
            session.working_dir.toLowerCase().includes(term),
        )
    }, [filteredByType, searchTerm])

    const totalPages = Math.ceil(filteredSessions.length / pageSize)
    const paginatedSessions = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize
        const endIndex = startIndex + pageSize
        return filteredSessions.slice(startIndex, endIndex)
    }, [filteredSessions, currentPage, pageSize])

    useEffect(() => {
        setCurrentPage(1)
    }, [historyFilter, searchTerm])

    const handleResumeSession = (session: SessionWithAgent) => {
        const resolvedAgentId = session.agentId || agents[0]?.id || ''
        if (resolvedAgentId && isScheduledSession(session)) {
            markSessionRead(resolvedAgentId, session.id)
        }
        navigate('/chat', {
            state: buildChatSessionState(session.id, resolvedAgentId),
        })
    }

    const handleMarkUnread = (session: SessionWithAgent) => {
        if (!isScheduledSession(session)) return
        const agentId = session.agentId || agents[0]?.id || ''
        if (!agentId) return
        markSessionUnread(agentId, session.id)
    }

    const handleRenameSession = useCallback((session: SessionWithAgent) => {
        setRenamingSession(session)
    }, [])

    const handleRenameSave = useCallback(async (nextTitle: string) => {
        if (!renamingSession) return

        const resolvedAgentId = renamingSession.agentId || agents[0]?.id || ''
        if (!resolvedAgentId) {
            showToast('error', t('history.renameSessionFailed'))
            return
        }

        setIsRenaming(true)
        try {
            await getClient(resolvedAgentId).updateSessionName(renamingSession.id, nextTitle)
            setSessions((prev) => prev.map((session) => (
                session.id === renamingSession.id && session.agentId === renamingSession.agentId
                    ? { ...session, name: nextTitle }
                    : session
            )))
            setRenamingSession(null)
            showToast('success', t('history.renameSessionSuccess'))
        } catch (err) {
            console.error('Failed to rename session:', err)
            showToast('error', t('history.renameSessionFailed'))
        } finally {
            setIsRenaming(false)
        }
    }, [agents, getClient, renamingSession, showToast, t])

    const handleDeleteSession = async (session: SessionWithAgent) => {
        const resolvedAgentId = session.agentId || agents[0]?.id
        const sessionKey = getSessionKey({ ...session, agentId: resolvedAgentId })
        if (deletingSessionKeys.has(sessionKey)) return

        try {
            setDeletingSessionKeys((prev) => new Set(prev).add(sessionKey))
            if (resolvedAgentId) {
                await getClient(resolvedAgentId).deleteSession(session.id)
            } else {
                for (const agent of agents) {
                    await getClient(agent.id).deleteSession(session.id)
                    break
                }
            }
            setSessions((prev) => prev.filter((current) => current.id !== session.id))
            setLastDeletedSessionId(session.id)
            setLastDeletedAt(Date.now())
            setCurrentPage((prev) => {
                const newFilteredCount = filteredSessions.length - 1
                const newTotalPages = Math.ceil(newFilteredCount / pageSize)
                return prev > newTotalPages ? Math.max(1, newTotalPages) : prev
            })
        } catch (err) {
            console.error('Failed to delete session:', err)
            const message = err instanceof Error ? err.message : 'Unknown error'
            if (message.includes('Resource not found')) {
                setSessions((prev) => prev.filter((current) => current.id !== session.id))
                setLastDeletedSessionId(session.id)
                setLastDeletedAt(Date.now())
                setCurrentPage((prev) => {
                    const newFilteredCount = filteredSessions.length - 1
                    const newTotalPages = Math.ceil(newFilteredCount / pageSize)
                    return prev > newTotalPages ? Math.max(1, newTotalPages) : prev
                })
                return
            }
            showToast('error', t('errors.deleteFailed'))
        } finally {
            setDeletingSessionKeys((prev) => {
                const next = new Set(prev)
                next.delete(sessionKey)
                return next
            })
        }
    }

    return (
        <div className="page-container sidebar-top-page page-shell-wide history-page">
            <PageHeader title={t('history.title')} subtitle={t('history.subtitle')} />

            {(error || (!isConnected && connectionError)) && (
                <div className="conn-banner conn-banner-error">
                    {error || t('common.connectionError', { error: connectionError })}
                </div>
            )}

            {lastDeletedSessionId && lastDeletedAt && (
                <div
                    style={{
                        padding: 'var(--spacing-3)',
                        background: 'rgba(16, 185, 129, 0.15)',
                        borderRadius: 'var(--radius-lg)',
                        color: 'var(--color-text-secondary)',
                        marginBottom: 'var(--spacing-6)',
                    }}
                >
                    {t('history.sessionDeleted')} • {new Date(lastDeletedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </div>
            )}

            <ListWorkbench
                controls={(
                    <ListToolbar
                        primary={(
                            <>
                                <ListSearchInput
                                    value={searchTerm}
                                    placeholder={t('history.searchPlaceholder')}
                                    onChange={setSearchTerm}
                                />

                                <div className="seg-filter" role="tablist" aria-label="Session type filter">
                                    <button type="button" className={`seg-filter-btn ${historyFilter === 'user' ? 'active' : ''}`} onClick={() => setHistoryFilter('user')}>
                                        {t('history.filterUser')}
                                    </button>
                                    <button type="button" className={`seg-filter-btn ${historyFilter === 'scheduled' ? 'active' : ''}`} onClick={() => setHistoryFilter('scheduled')}>
                                        {t('history.filterScheduled')}
                                    </button>
                                    <button type="button" className={`seg-filter-btn ${historyFilter === 'all' ? 'active' : ''}`} onClick={() => setHistoryFilter('all')}>
                                        {t('history.filterAll')}
                                    </button>
                                </div>
                            </>
                        )}
                        secondary={searchTerm ? <ListResultsMeta>{t('common.resultsFound', { count: filteredSessions.length })}</ListResultsMeta> : undefined}
                    />
                )}
                footer={filteredSessions.length > 0 ? (
                    <ListFooter>
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            pageSize={pageSize}
                            totalItems={filteredSessions.length}
                            onPageChange={setCurrentPage}
                            onPageSizeChange={(newSize) => {
                                setPageSize(newSize)
                                setCurrentPage(1)
                            }}
                            disabled={isLoading}
                        />
                    </ListFooter>
                ) : undefined}
            >
                {searchTerm && filteredSessions.length === 0 && !isLoading ? (
                    <div className="empty-state">
                        <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <h3 className="empty-state-title">{t('common.noResults')}</h3>
                        <p className="empty-state-description">
                            {t('history.noMatchSessions', { term: searchTerm })}
                        </p>
                    </div>
                ) : (
                    <SessionList
                        sessions={paginatedSessions}
                        isLoading={isLoading}
                        onResume={handleResumeSession}
                        onRename={handleRenameSession}
                        onDelete={handleDeleteSession}
                        deletingSessionKeys={deletingSessionKeys}
                        getSessionKey={getSessionKey}
                        onMarkUnread={historyFilter !== 'user' ? handleMarkUnread : undefined}
                    />
                )}
            </ListWorkbench>

            {renamingSession && (
                <RenameSessionDialog
                    initialTitle={renamingSession.name || ''}
                    isSaving={isRenaming}
                    onClose={() => {
                        if (isRenaming) return
                        setRenamingSession(null)
                    }}
                    onSave={handleRenameSave}
                />
            )}
        </div>
    )
}
