import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
import { useChannels } from '../hooks/useChannels'
import { useToast } from '../../../platform/providers/ToastContext'
import CreateChannelModal from '../components/CreateChannelModal'
import '../styles/channels.css'

function formatTimestamp(value: string | null | undefined, fallback: string): string {
    if (!value) return fallback
    const parsed = Date.parse(value)
    if (Number.isNaN(parsed)) return fallback
    return new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(parsed)
}

function getStatusTone(status: string): ResourceStatusTone {
    switch (status) {
    case 'ACTIVE':
        return 'success'
    case 'PENDING_LOGIN':
    case 'LOGIN_REQUIRED':
        return 'warning'
    case 'ERROR':
        return 'danger'
    case 'DISABLED':
        return 'neutral'
    default:
        return 'neutral'
    }
}

function getStatusLabel(status: string, t: (key: string) => string): string {
    switch (status) {
    case 'ACTIVE':
        return t('channels.statusActive')
    case 'PENDING_LOGIN':
        return t('channels.statusPendingLogin')
    case 'LOGIN_REQUIRED':
        return t('channels.statusLoginRequired')
    case 'ERROR':
        return t('channels.statusError')
    case 'DISABLED':
        return t('channels.statusDisabled')
    default:
        return status
    }
}

function getTypeLabel(type: string, t: (key: string) => string): string {
    switch (type) {
    case 'wechat':
        return t('channels.type_wechat')
    case 'whatsapp':
    default:
        return t('channels.type_whatsapp')
    }
}

export default function ChannelsPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { showToast } = useToast()
    const { channels, isLoading, error, fetchChannels, deleteChannel } = useChannels()
    const [searchTerm, setSearchTerm] = useState('')
    const [showCreateModal, setShowCreateModal] = useState(false)

    useEffect(() => {
        void fetchChannels()
    }, [fetchChannels])

    const filteredChannels = useMemo(() => {
        const term = searchTerm.trim().toLowerCase()
        return channels.filter(channel => {
            if (!term) return true
            return [
                channel.name,
                channel.id,
                getTypeLabel(channel.type, t),
                channel.defaultAgentId,
                channel.status,
            ].some(value => value.toLowerCase().includes(term))
        })
    }, [channels, searchTerm, t])

    const handleDelete = async (channelId: string, name: string) => {
        const confirmed = window.confirm(t('channels.confirmDelete', { name }))
        if (!confirmed) return

        const result = await deleteChannel(channelId)
        if (!result.success) {
            showToast('error', result.error || t('channels.deleteFailed'))
            return
        }

        showToast('success', t('channels.deleteSuccess'))
        void fetchChannels()
    }

    return (
        <div className="page-container sidebar-top-page page-shell-wide">
            <PageHeader
                title={t('channels.title')}
                subtitle={t('channels.subtitle')}
                action={(
                    <Button variant="primary" onClick={() => setShowCreateModal(true)}>
                        {t('channels.create')}
                    </Button>
                )}
            />

            {error && (
                <div className="conn-banner conn-banner-error">{t('common.connectionError', { error })}</div>
            )}

            <ListWorkbench
                controls={(
                    <ListSearchInput
                        value={searchTerm}
                        placeholder={t('channels.searchPlaceholder')}
                        onChange={setSearchTerm}
                    />
                )}
            >
                {isLoading ? (
                    <div className="empty-state">
                        <div className="empty-state-title">{t('common.loading')}</div>
                    </div>
                ) : filteredChannels.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-state-title">{t('channels.emptyTitle')}</div>
                        <div className="empty-state-description">{t('channels.emptyDescription')}</div>
                    </div>
                ) : (
                    <CardGrid>
                        {filteredChannels.map(channel => (
                            <ResourceCard
                                key={channel.id}
                                title={channel.name}
                                statusLabel={getStatusLabel(channel.status, t)}
                                statusTone={getStatusTone(channel.status)}
                                summary={(
                                    <div className="channel-card-summary">
                                        <span className="resource-card-tag">{getTypeLabel(channel.type, t)}</span>
                                    </div>
                                )}
                                metrics={[
                                    { label: t('channels.defaultAgent'), value: channel.defaultAgentId },
                                    { label: t('channels.bindingCount'), value: channel.bindingCount },
                                    { label: t('channels.loginStatus'), value: getStatusLabel(channel.status, t) },
                                    { label: t('channels.lastInbound'), value: formatTimestamp(channel.lastInboundAt, t('channels.never')) },
                                    { label: t('channels.lastOutbound'), value: formatTimestamp(channel.lastOutboundAt, t('channels.never')) },
                                ]}
                                footer={(
                                    <>
                                        <ResourceCardDangerAction onClick={() => void handleDelete(channel.id, channel.name)}>
                                            {t('channels.delete')}
                                        </ResourceCardDangerAction>
                                        <ResourceCardPrimaryAction onClick={() => navigate(`/channels/${channel.id}/configure`)}>
                                            {t('channels.configure')}
                                        </ResourceCardPrimaryAction>
                                    </>
                                )}
                            />
                        ))}
                    </CardGrid>
                )}
            </ListWorkbench>

            {showCreateModal && (
                <CreateChannelModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={() => void fetchChannels()}
                />
            )}
        </div>
    )
}
