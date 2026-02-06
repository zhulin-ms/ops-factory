import { useMemo, useState } from 'react'
import { useGoosed } from '../contexts/GoosedContext'
import { McpSection } from '../components/mcp'

function formatModel(provider?: string, model?: string): string {
    if (provider && model) return `${model} (${provider})`
    if (model) return model
    if (provider) return provider
    return 'Unknown'
}

export default function Agents() {
    const { agents, isConnected, error } = useGoosed()
    const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

    const agentSkillsMap = useMemo(() => {
        return new Map(agents.map(agent => [agent.id, agent.skills || []]))
    }, [agents])

    const activeAgent = useMemo(() => {
        if (!activeAgentId) return null
        return agents.find(agent => agent.id === activeAgentId) || null
    }, [agents, activeAgentId])

    return (
        <div className="page-container agents-page">
            <div className="page-header">
                <h1 className="page-title">Agents</h1>
                <p className="page-subtitle">Active and configured agents available through the gateway.</p>
            </div>

            {error && (
                <div className="agents-alert agents-alert-error">Connection error: {error}</div>
            )}
            {!isConnected && !error && (
                <div className="agents-alert agents-alert-warning">Connecting to gateway...</div>
            )}

            {agents.length === 0 ? (
                <div className="empty-state">
                    <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                    </svg>
                    <h3 className="empty-state-title">No agents found</h3>
                    <p className="empty-state-description">Configure agents in the gateway to see them here.</p>
                </div>
            ) : (
                <div className="agents-grid">
                    {agents.map(agent => {
                        const skills = agentSkillsMap.get(agent.id) || []
                        return (
                        <div key={agent.id} className="agent-card">
                            <div className="agent-card-header">
                                <div className="agent-card-title">
                                    <span className={`status-dot status-${agent.status}`}></span>
                                    <div>
                                        <div className="agent-name">{agent.name}</div>
                                    </div>
                                </div>
                                <span className={`status-pill status-${agent.status}`}>{agent.status}</span>
                            </div>

                            <div className="agent-meta">
                                <div className="agent-meta-row">
                                    <span className="agent-meta-label">Model</span>
                                    <span className="agent-meta-value">{formatModel(agent.provider, agent.model)}</span>
                                </div>
                                <div className="agent-meta-row">
                                    <span className="agent-meta-label">Port</span>
                                    <span className="agent-meta-value">{agent.port}</span>
                                </div>
                            </div>

                            <div className="agent-skills agent-meta-row">
                                <span className="agent-meta-label">Skills</span>
                                <div className="agent-skill-actions">
                                    <span className={`agent-meta-value ${skills.length === 0 ? 'is-empty' : ''}`}>
                                        {skills.length === 0 ? 'No skills configured' : skills.length}
                                    </span>
                                </div>
                            </div>
                            <div className="agent-skill-cta">
                                <button
                                    type="button"
                                    className="agent-skill-button"
                                    onClick={() => setActiveAgentId(agent.id)}
                                >
                                    Configure
                                </button>
                            </div>
                        </div>
                        )
                    })}
                </div>
            )}

            {activeAgent && (
                <div className="agent-drawer-overlay" onClick={() => setActiveAgentId(null)}>
                    <aside className="agent-drawer" onClick={event => event.stopPropagation()}>
                        <div className="agent-drawer-header">
                            <div>
                                <div className="agent-drawer-title">{activeAgent.name}</div>
                                <div className="agent-drawer-subtitle">{activeAgent.id}</div>
                            </div>
                            <button
                                type="button"
                                className="agent-drawer-close"
                                onClick={() => setActiveAgentId(null)}
                                aria-label="Close"
                            >
                                ×
                            </button>
                        </div>

                        <div className="agent-drawer-meta">
                            <div>
                                <div className="agent-drawer-label">Status</div>
                                <div className="agent-drawer-value">{activeAgent.status}</div>
                            </div>
                            <div>
                                <div className="agent-drawer-label">Model</div>
                                <div className="agent-drawer-value">{formatModel(activeAgent.provider, activeAgent.model)}</div>
                            </div>
                            <div>
                                <div className="agent-drawer-label">Port</div>
                                <div className="agent-drawer-value">{activeAgent.port}</div>
                            </div>
                            <div>
                                <div className="agent-drawer-label">Working Dir</div>
                                <div className="agent-drawer-value agent-meta-mono">{activeAgent.working_dir}</div>
                            </div>
                        </div>

                        <div className="agent-drawer-section">
                            <div className="agent-drawer-section-title">Skills</div>
                            {agentSkillsMap.get(activeAgent.id)?.length ? (
                                <div className="agent-drawer-skill-list">
                                    {agentSkillsMap.get(activeAgent.id)!.map(skill => (
                                        <span key={skill} className="agent-skill-chip">{skill}</span>
                                    ))}
                                </div>
                            ) : (
                                <div className="agent-skills-empty">No skills configured</div>
                            )}
                        </div>

                        <McpSection agentId={activeAgent.id} />
                    </aside>
                </div>
            )}
        </div>
    )
}
