import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGoosed } from '../../../../contexts/GoosedContext'
import { useUser } from '../../../../contexts/UserContext'
import PageHeader from '../../../../components/PageHeader'
import CardGrid from '../../../../components/cards/CardGrid'
import CardWorkbench from '../../../../components/cards/CardWorkbench'
import ResourceCard from '../../../../components/ResourceCard'
import { CreateAgentModal } from '../components/CreateAgentModal'
import { DeleteAgentModal } from '../components/DeleteAgentModal'
import { McpCount } from '../components/McpCount'
import '../styles/agents.css'

function getModelSummary(model?: string, provider?: string, unknownLabel = 'Unknown'): string {
    if (model) return model
    if (provider) return provider
    return unknownLabel
}

function shouldShowProviderTag(provider?: string, model?: string): boolean {
    return Boolean(provider && model && provider !== model)
}

export default function Agents() {
    const { t } = useTranslation()
    const { agents, isConnected, error, refreshAgents } = useGoosed()
    const { role } = useUser()
    const navigate = useNavigate()
    const isAdmin = role === 'admin'
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

    const agentSkillsMap = useMemo(() => {
        return new Map(agents.map(agent => [agent.id, agent.skills || []]))
    }, [agents])

    return (
        <div className="page-container sidebar-top-page resource-page">
            <PageHeader
                title={t('agents.title')}
                subtitle={t('agents.subtitle')}
                action={isAdmin ? (
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setShowCreateModal(true)}
                    >
                        {t('agents.createAgent')}
                    </button>
                ) : undefined}
            />

            {error && (
                <div className="conn-banner conn-banner-error">{t('common.connectionError', { error })}</div>
            )}
            {!isConnected && !error && (
                <div className="conn-banner conn-banner-warning">{t('common.connectingGateway')}</div>
            )}

            {agents.length === 0 ? (
                <div className="empty-state">
                    <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" />
                    </svg>
                    <h3 className="empty-state-title">{t('agents.noAgents')}</h3>
                    <p className="empty-state-description">{t('agents.noAgentsHint')}</p>
                </div>
            ) : (
                <CardWorkbench>
                    <CardGrid>
                    {agents.map(agent => {
                        const skills = agentSkillsMap.get(agent.id) || []
                        const modelSummary = getModelSummary(agent.model, agent.provider, t('agents.unknown'))
                        return (
                            <ResourceCard
                                key={agent.id}
                                title={agent.name}
                                tags={shouldShowProviderTag(agent.provider, agent.model) ? (
                                    <div className="resource-card-tags">
                                        <span className="resource-card-tag" title={agent.provider}>
                                            {agent.provider}
                                        </span>
                                    </div>
                                ) : undefined}
                                summary={(
                                    <p className="resource-card-summary-text resource-card-summary-code" title={modelSummary}>
                                        {modelSummary}
                                    </p>
                                )}
                                metrics={[
                                    { label: t('agents.skills'), value: skills.length },
                                    { label: t('agents.mcp'), value: <McpCount agentId={agent.id} /> },
                                ]}
                                footer={isAdmin ? (
                                    <>
                                        <button
                                            type="button"
                                            className="resource-card-danger-action"
                                            onClick={() => setDeleteTarget({ id: agent.id, name: agent.name })}
                                        >
                                            {t('agents.deleteAgent')}
                                        </button>
                                        <button
                                            type="button"
                                            className="resource-card-primary-action"
                                            onClick={() => navigate(`/agents/${agent.id}/configure`)}
                                        >
                                            {t('agents.configure')}
                                        </button>
                                    </>
                                ) : undefined}
                            />
                        )
                    })}
                    </CardGrid>
                </CardWorkbench>
            )}

            {showCreateModal && (
                <CreateAgentModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={refreshAgents}
                />
            )}

            {deleteTarget && (
                <DeleteAgentModal
                    agentId={deleteTarget.id}
                    agentName={deleteTarget.name}
                    onClose={() => setDeleteTarget(null)}
                    onDeleted={refreshAgents}
                />
            )}
        </div>
    )
}
