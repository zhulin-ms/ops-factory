import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import Button from '../../../platform/ui/primitives/Button'
import { useChannels } from '../hooks/useChannels'
import { useGoosed } from '../../../platform/providers/GoosedContext'
import { useToast } from '../../../platform/providers/ToastContext'
import { slugify } from '../../../../config/runtime'
import type { ChannelType, ChannelUpsertRequest } from '../../../../types/channel'

function buildSuggestedChannelId(value: string, fallbackSuffix: string): string {
    if (!value.trim()) return ''
    const normalizedId = slugify(value)
    if (normalizedId) return normalizedId
    return `channel-${fallbackSuffix}`
}

export default function CreateChannelModal({
    onClose,
    onCreated,
}: {
    onClose: () => void
    onCreated: () => void
}) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { showToast } = useToast()
    const { agents } = useGoosed()
    const { createChannel, isSaving } = useChannels()

    const defaultAgentId = useMemo(() => {
        return agents.find(agent => agent.id === 'fo-copilot')?.id
            || agents.find(agent => agent.id === 'universal-agent')?.id
            || agents[0]?.id
            || ''
    }, [agents])

    const [name, setName] = useState('')
    const [type, setType] = useState<ChannelType>('whatsapp')
    const [agentId, setAgentId] = useState(defaultAgentId)
    const [fallbackSuffix] = useState(() => Math.random().toString(36).slice(2, 8))

    const handleTypeChange = (nextType: ChannelType) => {
        setType(nextType)
    }

    const handleCreate = async () => {
        if (!name.trim()) {
            showToast('error', t('channels.validationName'))
            return
        }
        if (!agentId) {
            showToast('error', t('channels.validationAgent'))
            return
        }

        const payload: ChannelUpsertRequest = {
            id: buildSuggestedChannelId(name, fallbackSuffix),
            name: name.trim(),
            enabled: true,
            type,
            defaultAgentId: agentId,
            config: {
                loginStatus: 'disconnected',
                authStateDir: 'auth',
                lastConnectedAt: '',
                lastDisconnectedAt: '',
                lastError: '',
                selfPhone: '',
                wechatId: '',
                displayName: '',
            },
        }

        const result = await createChannel(payload)
        if (!result.success || !result.channel) {
            showToast('error', result.error || t('channels.createFailed'))
            return
        }

        showToast('success', t('channels.createSuccess'))
        onCreated()
        onClose()
        navigate(`/channels/${result.channel.id}/configure`)
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">{t('channels.createTitle')}</h2>
                    <button type="button" className="modal-close" onClick={onClose}>
                        ×
                    </button>
                </div>

                <div className="modal-body">
                    <p className="channel-create-modal-hint">
                        {t('channels.createOwnershipHint')}
                    </p>

                    <div className="form-group">
                        <label className="form-label">{t('channels.name')}</label>
                        <input
                            className="form-input"
                            type="text"
                            placeholder={t('channels.namePlaceholder')}
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            autoFocus
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">{t('channels.type')}</label>
                        <select
                            className="form-input"
                            value={type}
                            onChange={(event) => handleTypeChange(event.target.value as ChannelType)}
                        >
                            <option value="whatsapp">{t('channels.type_whatsapp')}</option>
                            <option value="wechat">{t('channels.type_wechat')}</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">{t('channels.defaultAgent')}</label>
                        <select
                            className="form-input"
                            value={agentId}
                            onChange={(event) => setAgentId(event.target.value)}
                        >
                            {agents.map(agent => (
                                <option key={agent.id} value={agent.id}>{agent.name}</option>
                            ))}
                        </select>
                    </div>

                </div>

                <div className="modal-footer">
                    <Button variant="secondary" onClick={onClose} disabled={isSaving}>
                        {t('common.cancel')}
                    </Button>
                    <Button variant="primary" onClick={() => void handleCreate()} disabled={isSaving || !name.trim()}>
                        {isSaving ? t('common.saving') : t('channels.create')}
                    </Button>
                </div>
            </div>
        </div>
    )
}
