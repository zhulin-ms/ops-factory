import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMcp } from '../../hooks/useMcp'
import McpCard from './McpCard'
import AddMcpModal from './AddMcpModal'
import type { McpEntry } from '../../types/mcp'
import './Mcp.css'

interface McpSectionProps {
  agentId: string | null
  onBrowseMarket?: () => void
}

export default function McpSection({ agentId, onBrowseMarket }: McpSectionProps) {
  const { t } = useTranslation()
  const {
    categorized,
    warnings,
    isLoading,
    error,
    fetchMcp,
    toggleMcp,
    addMcp,
    deleteMcp,
  } = useMcp(agentId)

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<McpEntry | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  useEffect(() => {
    if (agentId) {
      fetchMcp()
    }
  }, [agentId, fetchMcp])

  const handleDelete = async (name: string) => {
    if (deleteConfirm === name) {
      await deleteMcp(name)
      setDeleteConfirm(null)
    } else {
      setDeleteConfirm(name)
      // Auto-clear confirm after 3 seconds
      setTimeout(() => setDeleteConfirm(null), 3000)
    }
  }

  const handleOpenAddModal = () => {
    setEditingEntry(null)
    setIsAddModalOpen(true)
  }

  const handleOpenEditModal = (entry: McpEntry) => {
    setEditingEntry(entry)
    setIsAddModalOpen(true)
  }

  if (!agentId) {
    return null
  }

  const hasDefault = categorized.default.length > 0
  const hasAvailable = categorized.available.length > 0
  const hasCustom = categorized.custom.length > 0

  return (
    <div className="mcp-section">
      <div className="mcp-section-header">
        <h3 className="mcp-section-title">{t('mcp.title')}</h3>
        <div className="mcp-header-actions">
          {onBrowseMarket && (
            <button
              type="button"
              className="action-btn-secondary"
              onClick={onBrowseMarket}
            >
              {t('market.browseMarket')}
            </button>
          )}
          <button
            type="button"
            className="action-btn-primary"
            onClick={handleOpenAddModal}
          >
            {t('mcp.addServer')}
          </button>
        </div>
      </div>

      {error && (
        <div className="mcp-alert mcp-alert-error">{error}</div>
      )}

      {warnings.length > 0 && (
        <div className="mcp-alert mcp-alert-warning">
          {warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="mcp-loading">{t('mcp.loadingConfig')}</div>
      ) : (
        <>
          {hasDefault && (
            <div className="mcp-category">
              <h4 className="mcp-category-title">{t('mcp.enabled')}</h4>
              <div className="mcp-grid">
                {categorized.default.map(entry => (
                  <McpCard
                    key={entry.name}
                    entry={entry}
                    onToggle={toggleMcp}
                  />
                ))}
              </div>
            </div>
          )}

          {hasAvailable && (
            <div className="mcp-category">
              <h4 className="mcp-category-title">{t('mcp.available')}</h4>
              <div className="mcp-grid">
                {categorized.available.map(entry => (
                  <McpCard
                    key={entry.name}
                    entry={entry}
                    onToggle={toggleMcp}
                  />
                ))}
              </div>
            </div>
          )}

          {hasCustom && (
            <div className="mcp-category">
              <h4 className="mcp-category-title">{t('mcp.custom')}</h4>
              <div className="mcp-grid">
                {categorized.custom.map(entry => (
                  <McpCard
                    key={entry.name}
                    entry={entry}
                    onToggle={toggleMcp}
                    onEdit={handleOpenEditModal}
                    onDelete={(name) => handleDelete(name)}
                    isCustom
                  />
                ))}
              </div>
              {deleteConfirm && (
                <div className="mcp-delete-confirm">
                  {t('mcp.deleteConfirm', { name: deleteConfirm })}
                </div>
              )}
            </div>
          )}

          {!hasDefault && !hasAvailable && !hasCustom && (
            <div className="mcp-empty">
              <p>{t('mcp.noServers')}</p>
              <p>{t('mcp.noServersHint')}</p>
            </div>
          )}
        </>
      )}

      <AddMcpModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false)
          setEditingEntry(null)
        }}
        onSubmit={addMcp}
        mode={editingEntry ? 'edit' : 'add'}
        initialEntry={editingEntry}
      />
    </div>
  )
}
