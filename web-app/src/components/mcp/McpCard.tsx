import type { McpEntry } from '../../types/mcp'
import { getMcpDisplayName } from '../../types/mcp'

interface McpCardProps {
  entry: McpEntry
  onToggle: (name: string, enabled: boolean) => void
  onEdit?: (entry: McpEntry) => void
  onDelete?: (name: string) => void
  isCustom?: boolean
}

export default function McpCard({ entry, onToggle, onEdit, onDelete, isCustom }: McpCardProps) {
  const displayName = getMcpDisplayName(entry)

  const handleToggle = () => {
    onToggle(entry.name, !entry.enabled)
  }

  return (
    <div className={`mcp-card ${entry.enabled ? 'mcp-card-enabled' : ''}`}>
      <div className="mcp-card-header">
        <div className="mcp-card-title">
          <span className="mcp-card-name">{displayName}</span>
          {isCustom && <span className="mcp-card-badge">Custom</span>}
        </div>
        <label className="mcp-toggle">
          <input
            type="checkbox"
            checked={entry.enabled}
            onChange={handleToggle}
          />
          <span className="mcp-toggle-slider"></span>
        </label>
      </div>

      <p className="mcp-card-description">
        {entry.description || 'No description'}
      </p>

      {isCustom && entry.type === 'stdio' && entry.cmd && (
        <div className="mcp-card-meta">
          <code className="mcp-card-cmd">
            {entry.cmd} {entry.args?.join(' ')}
          </code>
        </div>
      )}

      {isCustom && entry.type === 'streamable_http' && entry.uri && (
        <div className="mcp-card-meta">
          <code className="mcp-card-cmd">{entry.uri}</code>
        </div>
      )}

      {isCustom && (onEdit || onDelete) && (
        <div className="mcp-card-actions">
          {onEdit && (
            <button
              type="button"
              className="mcp-card-action"
              onClick={() => onEdit(entry)}
            >
              Edit
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="mcp-card-action mcp-card-action-danger"
              onClick={() => onDelete(entry.name)}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}
