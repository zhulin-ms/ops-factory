import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGoosed } from '../../../platform/providers/GoosedContext'
import { useUser } from '../../../platform/providers/UserContext'
import Button from '../../../platform/ui/primitives/Button'
import PageHeader from '../../../platform/ui/primitives/PageHeader'
import CardGrid from '../../../platform/ui/cards/CardGrid'
import ListSearchInput from '../../../platform/ui/list/ListSearchInput'
import ListWorkbench from '../../../platform/ui/list/ListWorkbench'
import ResourceCard, {
    ResourceCardDangerAction,
    ResourceCardPrimaryAction,
    type ResourceStatusTone,
} from '../../../platform/ui/primitives/ResourceCard'
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

function getSearchableSkillText(skill: unknown): string {
    if (typeof skill === 'string') return skill
    if (skill && typeof skill === 'object') {
        const record = skill as Record<string, unknown>
        return [record.name, record.description, record.path]
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
            .join(' ')
    }
    return ''
}

function getAgentStatusTone(status?: string): ResourceStatusTone {
    switch (status?.toUpperCase()) {
    case 'ACTIVE':
        return 'success'
    case 'ERROR':
        return 'danger'
    case 'DISABLED':
        return 'neutral'
    default:
        return 'neutral'
    }
}

function getAgentStatusLabel(status: string | undefined, t: (key: string) => string): string {
    switch (status?.toUpperCase()) {
    case 'ACTIVE':
        return t('agents.statusActive')
    case 'DISABLED':
        return t('agents.statusDisabled')
    default:
        return status || t('agents.statusUnknown')
    }
}

export default function Agents() {
    const { t } = useTranslation()
    const { agents, isConnected, error, refreshAgents } = useGoosed()
    const { role } = useUser()
    const navigate = useNavigate()
    const isAdmin = role === 'admin'
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
    const [searchTerm, setSearchTerm] = useState('')

    const agentSkillsMap = useMemo(() => {
        return new Map(agents.map(agent => [agent.id, agent.skills || []]))
    }, [agents])

    const filteredAgents = useMemo(() => {
        const term = searchTerm.trim().toLowerCase()
        return agents.filter(agent => {
            const skills = agentSkillsMap.get(agent.id) || []
            const matchesSearch = !term
                || agent.name.toLowerCase().includes(term)
                || agent.id.toLowerCase().includes(term)
                || (agent.provider || '').toLowerCase().includes(term)
                || (agent.model || '').toLowerCase().includes(term)
                || skills.some(skill => getSearchableSkillText(skill).toLowerCase().includes(term))
            return matchesSearch
        })
    }, [agentSkillsMap, agents, searchTerm])

    return (
        <div className="page-container sidebar-top-page page-shell-wide">
            <PageHeader
                title={t('agents.title')}
                subtitle={t('agents.subtitle')}
                action={isAdmin ? (
                    <Button
                        variant="primary"
                        onClick={() => setShowCreateModal(true)}
                    >
                        {t('agents.createAgent')}
                    </Button>
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
                <ListWorkbench
                    controls={(
                        <ListSearchInput
                            value={searchTerm}
                            placeholder={t('agents.searchPlaceholder')}
                            onChange={setSearchTerm}
                        />
                    )}
                >
                    {filteredAgents.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-title">{t('agents.noAgents')}</div>
                            <div className="empty-state-description">{t('agents.noMatch')}</div>
                        </div>
                    ) : (
                        <CardGrid>
                            {filteredAgents.map(agent => {
                                const skills = agentSkillsMap.get(agent.id) || []
                                const modelSummary = getModelSummary(agent.model, agent.provider, t('agents.unknown'))
                                return (
                                    <ResourceCard
                                        key={agent.id}
                                        title={agent.name}
                                        statusLabel={getAgentStatusLabel(agent.status, t)}
                                        statusTone={getAgentStatusTone(agent.status)}
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
                                                <ResourceCardDangerAction onClick={() => setDeleteTarget({ id: agent.id, name: agent.name })}>
                                                    {t('agents.deleteAgent')}
                                                </ResourceCardDangerAction>
                                                <ResourceCardPrimaryAction onClick={() => navigate(`/agents/${agent.id}/configure`)}>
                                                    {t('agents.configure')}
                                                </ResourceCardPrimaryAction>
                                            </>
                                        ) : undefined}
                                    />
                                )
                            })}
                        </CardGrid>
                    )}
                </ListWorkbench>
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
