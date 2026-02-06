import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGoosed } from '../contexts/GoosedContext'
import ChatInput from '../components/ChatInput'
import SessionList, { type SessionWithAgent } from '../components/SessionList'
import { getAgentWorkingDir } from '../components/AgentSelector'
import type { Session } from '@goosed/sdk'

interface ModelInfo {
    provider: string
    model: string
}

interface AgentSession extends Session {
    agentId: string
}

export default function Home() {
    const navigate = useNavigate()
    const { getClient, agents, isConnected, error: connectionError } = useGoosed()
    const [recentSessions, setRecentSessions] = useState<AgentSession[]>([])
    const [isLoadingSessions, setIsLoadingSessions] = useState(true)
    const [isCreatingSession, setIsCreatingSession] = useState(false)
    const [selectedAgent, setSelectedAgent] = useState('')
    const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)
    const [deletingSessionKeys, setDeletingSessionKeys] = useState<Set<string>>(new Set())

    const getSessionKey = (session: SessionWithAgent) =>
        `${session.agentId || 'unknown'}:${session.id}`

    // Set default agent when agents load
    useEffect(() => {
        if (agents.length > 0 && !selectedAgent) {
            setSelectedAgent(agents[0].id)
        }
    }, [agents, selectedAgent])

    // Fetch model info from selected agent
    useEffect(() => {
        const fetchModelInfo = async () => {
            if (!isConnected || !selectedAgent) return
            try {
                const client = getClient(selectedAgent)
                const systemInfo = await client.systemInfo()
                if (systemInfo.provider && systemInfo.model) {
                    setModelInfo({ provider: systemInfo.provider, model: systemInfo.model })
                }
            } catch (err) {
                console.error('Failed to fetch model info:', err)
            }
        }
        fetchModelInfo()
    }, [getClient, selectedAgent, isConnected])

    // Load recent sessions from all agents
    useEffect(() => {
        const loadSessions = async () => {
            if (!isConnected || agents.length === 0) return

            const allSessions: AgentSession[] = []
            for (const agent of agents) {
                try {
                    const client = getClient(agent.id)
                    const sessions = await client.listSessions()
                    allSessions.push(...sessions.map(s => ({ ...s, agentId: agent.id })))
                } catch {
                    // agent might not be running
                }
            }

            allSessions.sort((a, b) =>
                new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
            )
            setRecentSessions(allSessions.slice(0, 5))
            setIsLoadingSessions(false)
        }
        loadSessions()
    }, [getClient, agents, isConnected])

    const handleInputSubmit = async (message: string) => {
        if (isCreatingSession || !selectedAgent) return

        setIsCreatingSession(true)
        try {
            const client = getClient(selectedAgent)
            const workingDir = getAgentWorkingDir(selectedAgent, agents)
            const session = await client.startSession(workingDir)
            await client.resumeSession(session.id)

            navigate(`/chat?sessionId=${session.id}&agent=${selectedAgent}`, {
                state: { initialMessage: message }
            })
        } catch (err) {
            console.error('Failed to create session:', err)
            alert('Failed to create session: ' + (err instanceof Error ? err.message : 'Unknown error'))
        } finally {
            setIsCreatingSession(false)
        }
    }

    const handleResumeSession = (session: SessionWithAgent) => {
        const resolvedAgentId = session.agentId || selectedAgent
        navigate(`/chat?sessionId=${session.id}&agent=${resolvedAgentId}`)
    }

    const handleDeleteSession = async (session: SessionWithAgent) => {
        const resolvedAgentId = session.agentId || selectedAgent
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
            setRecentSessions(prev => prev.filter(s => s.id !== session.id))
        } catch (err) {
            console.error('Failed to delete session:', err)
        } finally {
            setDeletingSessionKeys(prev => {
                const next = new Set(prev)
                next.delete(sessionKey)
                return next
            })
        }
    }

    return (
        <div className="home-container">
            <div className="home-hero">
                <h1 className="home-title">Hello, I'm Goose</h1>
                <p className="home-description">
                    Your AI-powered coding assistant. Ask me anything about your codebase,
                    let me help you write, debug, or explain code.
                </p>

                {connectionError && (
                    <div style={{
                        padding: 'var(--spacing-4)',
                        background: 'rgba(239, 68, 68, 0.2)',
                        borderRadius: 'var(--radius-lg)',
                        color: 'var(--color-error)',
                        marginBottom: 'var(--spacing-6)'
                    }}>
                        Connection error: {connectionError}
                    </div>
                )}

                {!isConnected && !connectionError && (
                    <div style={{
                        padding: 'var(--spacing-4)',
                        background: 'rgba(245, 158, 11, 0.2)',
                        borderRadius: 'var(--radius-lg)',
                        color: 'var(--color-warning)',
                        marginBottom: 'var(--spacing-6)'
                    }}>
                        Connecting to gateway...
                    </div>
                )}
            </div>

            <div className="home-input-container">
                <ChatInput
                    onSubmit={handleInputSubmit}
                    disabled={!isConnected || isCreatingSession || !selectedAgent}
                    placeholder={isCreatingSession ? "Creating session..." : "Ask me anything..."}
                    autoFocus
                    selectedAgent={selectedAgent}
                    onAgentChange={setSelectedAgent}
                    modelInfo={modelInfo}
                />
            </div>

            {recentSessions.length > 0 && (
                <div style={{
                    width: '100%',
                    maxWidth: '600px',
                    marginTop: 'var(--spacing-10)'
                }}>
                    <h3 style={{
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 600,
                        color: 'var(--color-text-secondary)',
                        marginBottom: 'var(--spacing-4)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                    }}>
                        Recent Chats
                    </h3>
                    <SessionList
                        sessions={recentSessions}
                        isLoading={isLoadingSessions}
                        onResume={handleResumeSession}
                        onDelete={handleDeleteSession}
                        deletingSessionKeys={deletingSessionKeys}
                        getSessionKey={getSessionKey}
                    />
                </div>
            )}
        </div>
    )
}
