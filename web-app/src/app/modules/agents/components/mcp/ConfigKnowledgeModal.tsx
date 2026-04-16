import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GATEWAY_URL, KNOWLEDGE_SERVICE_URL, gatewayHeaders } from '../../../../../config/runtime'
import { getErrorMessage } from '../../../../../utils/errorMessages'
import Button from '../../../../platform/ui/primitives/Button'
import { useToast } from '../../../../platform/providers/ToastContext'
import { useUser } from '../../../../platform/providers/UserContext'
import type { McpSettings } from '../../../../../types/mcp'

type KnowledgeSourceOption = {
  id: string
  name: string
  description?: string | null
  status?: string
}

interface ConfigKnowledgeModalProps {
  agentId: string
  mcpName: string
  isOpen: boolean
  onClose: () => void
}

export default function ConfigKnowledgeModal({
  agentId,
  mcpName,
  isOpen,
  onClose,
}: ConfigKnowledgeModalProps) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const { userId } = useUser()
  const [error, setError] = useState<string | null>(null)
  const [isLoadingSettings, setIsLoadingSettings] = useState(false)
  const [isLoadingSources, setIsLoadingSources] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [knowledgeScopeEnabled, setKnowledgeScopeEnabled] = useState(false)
  const [selectedSourceId, setSelectedSourceId] = useState('')
  const [knowledgeSources, setKnowledgeSources] = useState<KnowledgeSourceOption[]>([])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    let cancelled = false

    const load = async () => {
      setIsLoadingSettings(true)
      setIsLoadingSources(true)
      setError(null)
      try {
        const [settingsResponse, sourcesResponse] = await Promise.all([
          fetch(`${GATEWAY_URL}/agents/${agentId}/mcp/${encodeURIComponent(mcpName)}/settings`, {
            headers: gatewayHeaders(userId),
            signal: AbortSignal.timeout(10000),
          }),
          fetch(`${KNOWLEDGE_SERVICE_URL}/sources?page=1&pageSize=100`, {
            signal: AbortSignal.timeout(10000),
          }),
        ])

        if (!settingsResponse.ok) {
          throw new Error(`HTTP ${settingsResponse.status}: ${await settingsResponse.text()}`)
        }
        const settings = await settingsResponse.json() as McpSettings
        const nextSourceId = typeof settings.sourceId === 'string' ? settings.sourceId : ''

        const sourcesData = await sourcesResponse.json().catch(() => null) as { items?: KnowledgeSourceOption[]; message?: string } | null
        if (!sourcesResponse.ok) {
          throw new Error(sourcesData?.message || sourcesResponse.statusText)
        }

        if (cancelled) {
          return
        }

        setSelectedSourceId(nextSourceId)
        setKnowledgeScopeEnabled(Boolean(nextSourceId))
        setKnowledgeSources(sourcesData?.items || [])
      } catch (err) {
        if (!cancelled) {
          setSelectedSourceId('')
          setKnowledgeScopeEnabled(false)
          setKnowledgeSources([])
          setError(getErrorMessage(err))
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSettings(false)
          setIsLoadingSources(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [agentId, isOpen, mcpName, userId])

  const handleVerify = async () => {
    if (!selectedSourceId) {
      const message = t('mcp.knowledgeScopeRequired')
      setError(message)
      showToast('warning', message)
      return
    }

    setIsVerifying(true)
    setError(null)
    try {
      const response = await fetch(`${KNOWLEDGE_SERVICE_URL}/sources/${encodeURIComponent(selectedSourceId)}`, {
        signal: AbortSignal.timeout(10000),
      })
      const data = await response.json().catch(() => null) as { message?: string; name?: string } | null
      if (!response.ok) {
        throw new Error(data?.message || response.statusText)
      }
      showToast('success', t('mcp.knowledgeScopeVerifySuccess', { name: data?.name || selectedSourceId }))
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      showToast('error', message)
    } finally {
      setIsVerifying(false)
    }
  }

  const handleSave = async () => {
    if (knowledgeScopeEnabled && !selectedSourceId) {
      const message = t('mcp.knowledgeScopeRequired')
      setError(message)
      showToast('warning', message)
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const response = await fetch(`${GATEWAY_URL}/agents/${agentId}/mcp/${encodeURIComponent(mcpName)}/settings`, {
        method: 'PUT',
        headers: gatewayHeaders(userId),
        body: JSON.stringify({
          sourceId: knowledgeScopeEnabled ? selectedSourceId || null : null,
        }),
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`)
      }

      showToast('success', t('mcp.knowledgeScopeSaved'))
      onClose()
    } catch (err) {
      const message = getErrorMessage(err)
      setError(message)
      showToast('error', message)
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-default" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{t('mcp.configKnowledge')}</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            &times;
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="agents-alert agents-alert-error" style={{ marginBottom: 'var(--spacing-4)' }}>
              {error}
            </div>
          )}

          <div className="mcp-settings-card">
            <div className="mcp-settings-head">
              <div>
                <label className="form-label">{t('mcp.knowledgeScopeTitle')}</label>
                <p className="mcp-form-hint">{t('mcp.knowledgeScopeHint')}</p>
              </div>
              <label className="mcp-toggle">
                <input
                  type="checkbox"
                  checked={knowledgeScopeEnabled}
                  onChange={e => {
                    const nextEnabled = e.target.checked
                    setKnowledgeScopeEnabled(nextEnabled)
                    if (!nextEnabled) {
                      setSelectedSourceId('')
                    }
                  }}
                  disabled={isLoadingSettings}
                />
                <span className="mcp-toggle-slider"></span>
              </label>
            </div>

            {knowledgeScopeEnabled && (
              <div className="mcp-settings-body">
                <select
                  className="form-input"
                  value={selectedSourceId}
                  onChange={e => setSelectedSourceId(e.target.value)}
                  disabled={isLoadingSources}
                >
                  <option value="">{t('mcp.knowledgeBasePlaceholder')}</option>
                  {knowledgeSources.map(source => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </select>
                {selectedSourceId && (
                  <p className="mcp-form-hint">
                    {knowledgeSources.find(source => source.id === selectedSourceId)?.description || t('mcp.knowledgeScopeSelectedHint')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          {knowledgeScopeEnabled && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleVerify()}
              disabled={isLoadingSources || isVerifying}
            >
              {isVerifying ? t('mcp.verifyingKnowledgeScope') : t('mcp.verifyKnowledgeScope')}
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={isSaving}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSave()}
            disabled={isSaving || isLoadingSettings}
          >
            {isSaving ? t('agentConfigure.saving') : t('mcp.saveChanges')}
          </Button>
        </div>
      </div>
    </div>
  )
}
