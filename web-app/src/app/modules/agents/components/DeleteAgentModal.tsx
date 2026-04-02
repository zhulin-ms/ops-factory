import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useUser } from '../../../../contexts/UserContext'
import { GATEWAY_URL, gatewayHeaders } from '../../../../config/runtime'

export function DeleteAgentModal({
    agentId,
    agentName,
    onClose,
    onDeleted,
}: {
    agentId: string
    agentName: string
    onClose: () => void
    onDeleted: () => void
}) {
    const { t } = useTranslation()
    const { userId } = useUser()
    const [deleting, setDeleting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleDelete = useCallback(async () => {
        setError(null)
        setDeleting(true)
        try {
            const response = await fetch(`${GATEWAY_URL}/agents/${agentId}`, {
                method: 'DELETE',
                headers: gatewayHeaders(userId),
            })
            const data = await response.json()
            if (!response.ok || !data.success) {
                setError(data.error || t('agents.deleteFailed', { error: 'Unknown error' }))
                return
            }
            onDeleted()
            onClose()
        } catch (err) {
            setError(t('agents.deleteFailed', { error: err instanceof Error ? err.message : 'Network error' }))
        } finally {
            setDeleting(false)
        }
    }, [agentId, userId, t, onDeleted, onClose])

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(event) => event.stopPropagation()}>
                <div className="modal-header">
                    <h2 className="modal-title">{t('agents.deleteAgentTitle')}</h2>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                <div className="modal-body">
                    {error && (
                        <div className="agents-alert agents-alert-error" style={{ marginBottom: 'var(--spacing-4)' }}>
                            {error}
                        </div>
                    )}

                    <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-primary)', marginBottom: 'var(--spacing-4)' }}>
                        {t('agents.deleteAgentConfirm', { name: agentName })}
                    </p>

                    <div className="agents-alert agents-alert-warning" style={{ marginBottom: 0 }}>
                        {t('agents.deleteAgentWarning')}
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose} disabled={deleting}>
                        {t('common.cancel')}
                    </button>
                    <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                        {deleting ? t('agents.deleting') : t('common.delete')}
                    </button>
                </div>
            </div>
        </div>
    )
}

