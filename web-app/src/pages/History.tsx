import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoosed } from '../contexts/GoosedContext'
import SessionList, { type SessionWithAgent } from '../components/SessionList'
import type { Session } from '@goosed/sdk'

interface AgentSession extends Session {
    agentId: string
}

export default function History() {
    const navigate = useNavigate()
    const { getClient, agents, isConnected } = useGoosed()
    const [sessions, setSessions] = useState<AgentSession[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [deletingSessionKeys, setDeletingSessionKeys] = useState<Set<string>>(new Set())
    const [lastDeletedSessionId, setLastDeletedSessionId] = useState<string | null>(null)
    const [lastDeletedAt, setLastDeletedAt] = useState<number | null>(null)

    const getSessionKey = (session: SessionWithAgent) =>
        `${session.agentId || 'unknown'}:${session.id}`

    // Load all sessions from all agents
    useEffect(() => {
        let cancelled = false
        const loadSessions = async () => {
            if (!isConnected || agents.length === 0) return

            setIsLoading(true)
            setError(null)

            try {
                const allSessions: AgentSession[] = []
                for (const agent of agents) {
                    try {
                        const client = getClient(agent.id)
                        const agentSessions = await client.listSessions()
                        allSessions.push(...agentSessions.map((s: Session) => ({ ...s, agentId: agent.id })))
                    } catch {
                        // agent might not be running
                    }
                }
                // Sort by updated_at descending
                const sorted = allSessions.sort((a: AgentSession, b: AgentSession) =>
                    new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
                )
                if (!cancelled) {
                    setSessions(sorted)
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

        loadSessions()
        return () => {
            cancelled = true
        }
    }, [getClient, agents, isConnected])

    // Filter sessions by search term
    const filteredSessions = useMemo(() => {
        if (!searchTerm.trim()) return sessions

        const term = searchTerm.toLowerCase()
        return sessions.filter(session =>
            session.name.toLowerCase().includes(term) ||
            session.working_dir.toLowerCase().includes(term)
        )
    }, [sessions, searchTerm])

    const handleResumeSession = (session: SessionWithAgent) => {
        const resolvedAgentId = session.agentId || agents[0]?.id || ''
        navigate(`/chat?sessionId=${session.id}&agent=${resolvedAgentId}`)
    }

    const handleDeleteSession = async (session: SessionWithAgent) => {
        const resolvedAgentId = session.agentId || agents[0]?.id
        const sessionKey = getSessionKey({ ...session, agentId: resolvedAgentId })
        if (deletingSessionKeys.has(sessionKey)) return
        try {
            setDeletingSessionKeys(prev => new Set(prev).add(sessionKey))
            if (resolvedAgentId) {
                const client = getClient(resolvedAgentId)
                await client.deleteSession(session.id)
            } else {
                for (const agent of agents) {
                    const client = getClient(agent.id)
                    await client.deleteSession(session.id)
                    break
                }
            }
            setSessions(prev => prev.filter(s => s.id !== session.id))
            setLastDeletedSessionId(session.id)
            setLastDeletedAt(Date.now())
        } catch (err) {
            console.error('Failed to delete session:', err)
            const message = err instanceof Error ? err.message : 'Unknown error'
            if (message.includes('Resource not found')) {
                setSessions(prev => prev.filter(s => s.id !== session.id))
                setLastDeletedSessionId(session.id)
                setLastDeletedAt(Date.now())
                return
            }
            alert('Failed to delete session: ' + message)
        } finally {
            setDeletingSessionKeys(prev => {
                const next = new Set(prev)
                next.delete(sessionKey)
                return next
            })
        }
    }

    return (
        <div className="page-container">
            <header className="page-header">
                <h1 className="page-title">Chat History</h1>
                <p className="page-subtitle">
                    View and manage your previous chat sessions
                </p>
            </header>

            <div className="search-container">
                <div className="search-input-wrapper">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search sessions..."
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
                                padding: 'var(--spacing-1)'
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

            {error && (
                <div style={{
                    padding: 'var(--spacing-4)',
                    background: 'rgba(239, 68, 68, 0.2)',
                    borderRadius: 'var(--radius-lg)',
                    color: 'var(--color-error)',
                    marginBottom: 'var(--spacing-6)'
                }}>
                    ⚠️ {error}
                </div>
            )}

            {lastDeletedSessionId && lastDeletedAt && (
                <div style={{
                    padding: 'var(--spacing-3)',
                    background: 'rgba(16, 185, 129, 0.15)',
                    borderRadius: 'var(--radius-lg)',
                    color: 'var(--color-text-secondary)',
                    marginBottom: 'var(--spacing-6)'
                }}>
                    Session deleted • {new Date(lastDeletedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </div>
            )}

            {searchTerm && filteredSessions.length === 0 && !isLoading && (
                <div className="empty-state">
                    <svg
                        className="empty-state-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                    >
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <h3 className="empty-state-title">No results found</h3>
                    <p className="empty-state-description">
                        No sessions match "{searchTerm}"
                    </p>
                </div>
            )}

            {(!searchTerm || filteredSessions.length > 0) && (
                <>
                    {searchTerm && (
                        <p style={{
                            fontSize: 'var(--font-size-sm)',
                            color: 'var(--color-text-secondary)',
                            marginBottom: 'var(--spacing-4)'
                        }}>
                            {filteredSessions.length} result{filteredSessions.length !== 1 ? 's' : ''} found
                        </p>
                    )}

                    <SessionList
                        sessions={filteredSessions}
                        isLoading={isLoading}
                        onResume={handleResumeSession}
                        onDelete={handleDeleteSession}
                        deletingSessionKeys={deletingSessionKeys}
                        getSessionKey={getSessionKey}
                    />
                </>
            )}

            {!isLoading && sessions.length > 0 && (
                <p style={{
                    marginTop: 'var(--spacing-6)',
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-muted)',
                    textAlign: 'center'
                }}>
                    {sessions.length} total session{sessions.length !== 1 ? 's' : ''}
                </p>
            )}
        </div>
    )
}
