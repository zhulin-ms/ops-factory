import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { HostGroup, Cluster } from '../../../../types/host'

export type TreeNodeType = 'group' | 'subgroup' | 'cluster'

export type TreeNode = {
    id: string
    type: TreeNodeType
    name: string
    subtitle?: string
    children?: TreeNode[]
    raw?: HostGroup | Cluster
}

type Props = {
    tree: TreeNode[]
    selectedId: string | null
    selectedType: TreeNodeType | null
    onSelect: (id: string, type: TreeNodeType) => void
    onEdit?: (id: string, type: TreeNodeType) => void
    onDelete?: (id: string, type: TreeNodeType) => void
}

export default function ResourceTree({ tree, selectedId, selectedType, onSelect, onEdit, onDelete }: Props) {
    const { t } = useTranslation()

    if (tree.length === 0) {
        return (
            <div className="hr-tree-empty">
                {t('hostResource.noGroups')}
            </div>
        )
    }

    return (
        <div className="hr-tree">
            {tree.map(node => (
                <TreeNodeItem
                    key={node.id}
                    node={node}
                    depth={0}
                    selectedId={selectedId}
                    selectedType={selectedType}
                    onSelect={onSelect}
                    onEdit={onEdit}
                    onDelete={onDelete}
                />
            ))}
        </div>
    )
}

function TreeNodeItem({ node, depth, selectedId, selectedType, onSelect, onEdit, onDelete }: {
    node: TreeNode
    depth: number
    selectedId: string | null
    selectedType: TreeNodeType | null
    onSelect: (id: string, type: TreeNodeType) => void
    onEdit?: (id: string, type: TreeNodeType) => void
    onDelete?: (id: string, type: TreeNodeType) => void
}) {
    const isSelected = selectedId === node.id && selectedType === node.type
    const hasChildren = node.children && node.children.length > 0
    const [expanded, setExpanded] = useState(true)

    const handleClick = () => {
        onSelect(node.id, node.type)
    }

    const handleToggle = (e: React.MouseEvent) => {
        e.stopPropagation()
        setExpanded(prev => !prev)
    }

    const iconClass = node.type === 'group' || node.type === 'subgroup'
        ? 'hr-tree-icon-folder'
        : 'hr-tree-icon-cluster'

    return (
        <div className="hr-tree-node-wrapper">
            <div
                className={`hr-tree-node ${isSelected ? 'hr-tree-node-selected' : ''}`}
                style={{ paddingLeft: depth * 16 + 8 }}
                onClick={handleClick}
            >
                {hasChildren && (
                    <span
                        className={`hr-tree-chevron ${expanded ? 'hr-tree-chevron-open' : ''}`}
                        onClick={handleToggle}
                    >
                        &#9654;
                    </span>
                )}
                <span className={`hr-tree-icon ${iconClass}`} />
                <span className="hr-tree-label">{node.name}</span>
                {node.subtitle && <span className="hr-tree-subtitle">{node.subtitle}</span>}
                <span className="hr-tree-node-actions" onClick={e => e.stopPropagation()}>
                    {onEdit && (
                        <button
                            className="hr-tree-node-action"
                            title="Edit"
                            onClick={() => onEdit(node.id, node.type)}
                        >
                            &#9998;
                        </button>
                    )}
                    {onDelete && (
                        <button
                            className="hr-tree-node-action hr-tree-node-action-danger"
                            title="Delete"
                            onClick={() => onDelete(node.id, node.type)}
                        >
                            &#128465;
                        </button>
                    )}
                </span>
            </div>
            {hasChildren && expanded && (
                <div className="hr-tree-children">
                    {node.children!.map(child => (
                        <TreeNodeItem
                            key={child.id}
                            node={child}
                            depth={depth + 1}
                            selectedId={selectedId}
                            selectedType={selectedType}
                            onSelect={onSelect}
                            onEdit={onEdit}
                            onDelete={onDelete}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
