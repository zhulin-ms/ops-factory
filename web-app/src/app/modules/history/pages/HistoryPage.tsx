import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Session } from '@goosed/sdk'
import { useGoosed } from '../../../../contexts/GoosedContext'
import { useInbox } from '../../../../contexts/InboxContext'
import { useToast } from '../../../../contexts/ToastContext'
import Pagination from '../../../../components/Pagination'
import { isScheduledSession } from '../../../../config/runtime'
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

                allSessions.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
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
        navigate(`/chat?sessionId=${session.id}&agent=${resolvedAgentId}`)
    }

    const handleMarkUnread = (session: SessionWithAgent) => {
        if (!isScheduledSession(session)) return
        const agentId = session.agentId || agents[0]?.id || ''
        if (!agentId) return
        markSessionUnread(agentId, session.id)
    }

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
        <div className="page-container sidebar-top-page history-page">
            <header className="page-header">
                <h1 className="page-title">{t('history.title')}</h1>
                <p className="page-subtitle">{t('history.subtitle')}</p>
            </header>

            {(error || (!isConnected && connectionError)) && (
                <div className="conn-banner conn-banner-error">
                    {error || t('common.connectionError', { error: connectionError })}
                </div>
            )}

            <div className="search-container">
                <div className="search-input-wrapper">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        type="text"
                        className="search-input"
                        placeholder={t('history.searchPlaceholder')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--color-text-muted)',
                                cursor: 'pointer',
                                padding: 'var(--spacing-1)',
                            }}
                            aria-label="Clear search"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

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

            {searchTerm && filteredSessions.length === 0 && !isLoading && (
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
            )}

            {(!searchTerm || filteredSessions.length > 0) && (
                <>
                    {searchTerm && (
                        <p
                            style={{
                                fontSize: 'var(--font-size-sm)',
                                color: 'var(--color-text-secondary)',
                                marginBottom: 'var(--spacing-4)',
                            }}
                        >
                            {t('common.resultsFound', { count: filteredSessions.length })}
                        </p>
                    )}

                    <SessionList
                        sessions={paginatedSessions}
                        isLoading={isLoading}
                        onResume={handleResumeSession}
                        onDelete={handleDeleteSession}
                        deletingSessionKeys={deletingSessionKeys}
                        getSessionKey={getSessionKey}
                        onMarkUnread={historyFilter !== 'user' ? handleMarkUnread : undefined}
                    />

                    {filteredSessions.length > 0 && (
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
                    )}
                </>
            )}

            {!isLoading && filteredByType.length > 0 && (
                <p
                    style={{
                        marginTop: 'var(--spacing-6)',
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-muted)',
                        textAlign: 'center',
                    }}
                >
                    {t('common.totalSessions', { count: filteredByType.length })}
                </p>
            )}
        </div>
    )
}
