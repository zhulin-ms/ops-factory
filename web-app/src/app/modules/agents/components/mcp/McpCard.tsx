import { useTranslation } from 'react-i18next'
import type { McpEntry } from '../../../../../types/mcp'
import { getMcpDisplayName } from '../../../../../types/mcp'
import Button from '../../../../platform/ui/primitives/Button'

interface McpCardProps {
  entry: McpEntry
  onToggle: (name: string, enabled: boolean) => void
  onEdit?: (entry: McpEntry) => void
  onConfigKnowledge?: (entry: McpEntry) => void
  onDelete?: (name: string) => void
  isCustom?: boolean
}

export default function McpCard({ entry, onToggle, onEdit, onConfigKnowledge, onDelete, isCustom }: McpCardProps) {
  const { t } = useTranslation()
  const displayName = getMcpDisplayName(entry)

  const handleToggle = () => {
    onToggle(entry.name, !entry.enabled)
  }

  return (
    <div className={`mcp-card ${entry.enabled ? 'mcp-card-enabled' : ''}`}>
      <div className="mcp-card-header">
        <div className="mcp-card-title">
          <span className="mcp-card-name">{displayName}</span>
          {isCustom && <span className="mcp-card-badge">{t('mcp.customBadge')}</span>}
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
        {entry.description || t('mcp.noDescription')}
      </p>

      {(isCustom || onConfigKnowledge) && (onEdit || onConfigKnowledge || onDelete) && (
        <div className="mcp-card-actions">
          {onConfigKnowledge && (
            <Button
              variant="secondary"
              tone="subtle"
              size="sm"
              onClick={() => onConfigKnowledge(entry)}
            >
              {t('mcp.configKnowledge')}
            </Button>
          )}
          {onEdit && (
            <Button
              variant="secondary"
              tone="subtle"
              size="sm"
              onClick={() => onEdit(entry)}
            >
              {t('common.edit')}
            </Button>
          )}
          {onDelete && (
            <Button
              variant="danger"
              tone="quiet"
              size="sm"
              onClick={() => onDelete(entry.name)}
            >
              {t('common.delete')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
