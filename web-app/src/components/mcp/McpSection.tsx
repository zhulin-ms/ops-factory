import { useEffect, useState } from 'react'
import { useMcp } from '../../hooks/useMcp'
import McpCard from './McpCard'
import AddMcpModal from './AddMcpModal'

interface McpSectionProps {
  agentId: string | null
}

export default function McpSection({ agentId }: McpSectionProps) {
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

  if (!agentId) {
    return null
  }

  const hasDefault = categorized.default.length > 0
  const hasAvailable = categorized.available.length > 0
  const hasCustom = categorized.custom.length > 0

  return (
    <div className="mcp-section">
      <div className="mcp-section-header">
        <h3 className="mcp-section-title">MCP Servers</h3>
        <button
          type="button"
          className="mcp-add-btn"
          onClick={() => setIsAddModalOpen(true)}
        >
          + Add MCP Server
        </button>
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
        <div className="mcp-loading">Loading MCP configuration...</div>
      ) : (
        <>
          {hasDefault && (
            <div className="mcp-category">
              <h4 className="mcp-category-title">Default</h4>
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
              <h4 className="mcp-category-title">Available</h4>
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
              <h4 className="mcp-category-title">Custom</h4>
              <div className="mcp-grid">
                {categorized.custom.map(entry => (
                  <McpCard
                    key={entry.name}
                    entry={entry}
                    onToggle={toggleMcp}
                    onDelete={(name) => handleDelete(name)}
                    isCustom
                  />
                ))}
              </div>
              {deleteConfirm && (
                <div className="mcp-delete-confirm">
                  Click delete again to confirm removing "{deleteConfirm}"
                </div>
              )}
            </div>
          )}

          {!hasDefault && !hasAvailable && !hasCustom && (
            <div className="mcp-empty">
              <p>No MCP servers configured.</p>
              <p>Click "Add MCP Server" to add one.</p>
            </div>
          )}
        </>
      )}

      <AddMcpModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={addMcp}
      />
    </div>
  )
}
