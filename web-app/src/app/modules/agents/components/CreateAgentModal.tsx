import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useUser } from '../../../../contexts/UserContext'
import { GATEWAY_URL, gatewayHeaders, slugify } from '../../../../config/runtime'

const DEFAULT_LLM = { provider: 'openai', model: 'qwen/qwen3.5-35b-a3b' }

export function CreateAgentModal({
    onClose,
    onCreated,
}: {
    onClose: () => void
    onCreated: () => void
}) {
    const { t } = useTranslation()
    const { userId } = useUser()
    const [name, setName] = useState('')
    const [id, setId] = useState('')
    const [idManuallyEdited, setIdManuallyEdited] = useState(false)
    const [creating, setCreating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleNameChange = useCallback((value: string) => {
        setName(value)
        if (!idManuallyEdited) {
            setId(slugify(value))
        }
    }, [idManuallyEdited])

    const handleIdChange = useCallback((value: string) => {
        setIdManuallyEdited(true)
        setId(value)
    }, [])

    const isValidId = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(id) && id.length >= 2

    const handleCreate = useCallback(async () => {
        setError(null)
        if (!name.trim()) { setError(t('agents.nameRequired')); return }
        if (!id.trim()) { setError(t('agents.idRequired')); return }
        if (!isValidId) { setError(t('agents.idInvalid')); return }

        setCreating(true)
        try {
            const response = await fetch(`${GATEWAY_URL}/agents`, {
                method: 'POST',
                headers: gatewayHeaders(userId),
                body: JSON.stringify({ id: id.trim(), name: name.trim() }),
            })
            const data = await response.json()
            if (!response.ok || !data.success) {
                setError(data.error || t('agents.createFailed', { error: 'Unknown error' }))
                return
            }
            onCreated()
            onClose()
        } catch (err) {
            setError(t('agents.createFailed', { error: err instanceof Error ? err.message : 'Network error' }))
        } finally {
            setCreating(false)
        }
    }, [name, id, isValidId, userId, t, onCreated, onClose])

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">{t('agents.createAgentTitle')}</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-body">
                    {error && (
                        <div className="agents-alert agents-alert-error" style={{ marginBottom: 'var(--spacing-4)' }}>
                            {error}
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label">{t('agents.agentName')}</label>
                        <input
                            className="form-input"
                            type="text"
                            placeholder={t('agents.agentNamePlaceholder')}
                            value={name}
                            onChange={(event) => handleNameChange(event.target.value)}
                            autoFocus
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">{t('agents.agentId')}</label>
                        <input
                            className="form-input"
                            type="text"
                            placeholder={t('agents.agentIdPlaceholder')}
                            value={id}
                            onChange={(event) => handleIdChange(event.target.value)}
                        />
                        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--spacing-1)' }}>
                            {t('agents.agentIdHint')}
                        </p>
                    </div>

                    <div className="form-group">
                        <label className="form-label">{t('agents.llmConfig')}</label>
                        <div
                            style={{
                                background: 'var(--color-bg-secondary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-lg)',
                                padding: 'var(--spacing-3) var(--spacing-4)',
                            }}
                        >
                            <div className="agent-meta-row">
                                <span className="agent-meta-label">{t('agents.provider')}</span>
                                <span className="agent-meta-value">{DEFAULT_LLM.provider}</span>
                            </div>
                            <div className="agent-meta-row">
                                <span className="agent-meta-label">{t('agents.model')}</span>
                                <span className="agent-meta-value">{DEFAULT_LLM.model}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose} disabled={creating}>
                        {t('common.cancel')}
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleCreate}
                        disabled={creating || !name.trim() || !isValidId}
                    >
                        {creating ? t('agents.creating') : t('agents.createAgentTitle')}
                    </button>
                </div>
            </div>
        </div>
    )
}

