import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import './Memory.css'
import '../prompt/PromptsSection.css'

export interface MemoryEntry {
    tags: string[]
    content: string
}

// Muted palette — low saturation, enough to tell apart but not shout
const TAG_PALETTE = [
    { bg: 'rgba(59, 130, 246, 0.08)',  fg: '#4b7cc4' },  // steel blue
    { bg: 'rgba(16, 185, 129, 0.08)',  fg: '#3a9a7e' },  // sage
    { bg: 'rgba(139, 92, 246, 0.08)',  fg: '#8872b8' },  // lavender
    { bg: 'rgba(245, 158, 11, 0.07)',  fg: '#b8923a' },  // sand
    { bg: 'rgba(236, 72, 153, 0.07)', fg: '#b8648a' },   // dusty rose
    { bg: 'rgba(6, 182, 212, 0.08)',  fg: '#3a8f9a' },   // teal
    { bg: 'rgba(234, 88, 12, 0.07)',  fg: '#b07040' },   // terracotta
    { bg: 'rgba(99, 102, 241, 0.08)', fg: '#6e70b8' },   // periwinkle
]

function hashTag(s: string): number {
    let h = 0
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
    return Math.abs(h)
}

export function getTagColor(tag: string) {
    return TAG_PALETTE[hashTag(tag) % TAG_PALETTE.length]
}

export function parseMemoryContent(raw: string): MemoryEntry[] {
    if (!raw.trim()) return []
    const blocks = raw.split(/\n\n+/)
    const entries: MemoryEntry[] = []
    for (const block of blocks) {
        const trimmed = block.trim()
        if (!trimmed) continue
        const lines = trimmed.split('\n')
        if (lines[0].startsWith('#')) {
            const tagLine = lines[0].replace(/^#+\s*/, '')
            const tags = tagLine.split(/\s+/).filter(Boolean)
            const content = lines.slice(1).join('\n').trim()
            entries.push({ tags, content })
        } else {
            entries.push({ tags: [], content: trimmed })
        }
    }
    return entries
}

interface MemoryFileCardProps {
    category: string
    content: string
    onSave: (content: string) => Promise<boolean>
    onDelete: () => void
    autoEdit?: boolean
}

export default function MemoryFileCard({ category, content, onSave, onDelete, autoEdit }: MemoryFileCardProps) {
    const { t } = useTranslation()
    const [isEditing, setIsEditing] = useState(autoEdit || false)
    const [editContent, setEditContent] = useState(content)
    const [isSaving, setIsSaving] = useState(false)
    const [hasChanges, setHasChanges] = useState(false)

    const entries = useMemo(() => isEditing ? [] : parseMemoryContent(content), [isEditing, content])

    const handleEdit = () => {
        setEditContent(content)
        setIsEditing(true)
        setHasChanges(false)
    }

    const handleCancel = () => {
        setEditContent(content)
        setIsEditing(false)
        setHasChanges(false)
    }

    const handleSave = async () => {
        setIsSaving(true)
        const ok = await onSave(editContent)
        setIsSaving(false)
        if (ok) {
            setIsEditing(false)
            setHasChanges(false)
        }
    }

    const handleChange = (val: string) => {
        setEditContent(val)
        setHasChanges(val !== content)
    }

    return (
        <div className={`memory-file-card ${isEditing ? 'memory-file-card-editing' : ''}`}>
            <div className="memory-file-header">
                <div className="memory-file-title">
                    <span className="memory-file-name">{category}</span>
                    <span className="memory-file-count">
                        {entries.length > 0 && t('memory.entryCount', { count: entries.length })}
                    </span>
                </div>
                <div className="memory-file-actions">
                    {isEditing ? (
                        <button
                            type="button"
                            className="prompts-edit-btn"
                            onClick={handleCancel}
                        >
                            {t('prompts.collapse')}
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="prompts-edit-btn"
                            onClick={handleEdit}
                        >
                            {t('common.edit')}
                        </button>
                    )}
                    <button
                        type="button"
                        className="memory-delete-icon"
                        onClick={onDelete}
                        title={t('common.delete')}
                    >
                        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M5.5 1C5.22386 1 5 1.22386 5 1.5C5 1.77614 5.22386 2 5.5 2H9.5C9.77614 2 10 1.77614 10 1.5C10 1.22386 9.77614 1 9.5 1H5.5ZM3 3.5C3 3.22386 3.22386 3 3.5 3H5H10H11.5C11.7761 3 12 3.22386 12 3.5C12 3.77614 11.7761 4 11.5 4H11V12C11 12.5523 10.5523 13 10 13H5C4.44772 13 4 12.5523 4 12V4H3.5C3.22386 4 3 3.77614 3 3.5ZM5 4H10V12H5V4Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"/>
                        </svg>
                    </button>
                </div>
            </div>

            {isEditing ? (
                <div className="memory-file-editor">
                    <textarea
                        className="prompts-textarea"
                        value={editContent}
                        onChange={e => handleChange(e.target.value)}
                        rows={10}
                    />
                    <div className="memory-format-hint">
                        {t('memory.formatHint')}
                    </div>
                    <div className="prompts-editor-actions">
                        <div className="prompts-editor-actions-left" />
                        <div className="prompts-editor-actions-right">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={handleCancel}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleSave}
                                disabled={isSaving || !hasChanges}
                            >
                                {isSaving ? t('agentConfigure.saving') : t('common.save')}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="memory-entries">
                    {entries.length === 0 ? (
                        <div className="memory-entry-empty">{t('memory.emptyFile')}</div>
                    ) : (
                        entries.map((entry, idx) => (
                            <div key={idx} className="memory-entry">
                                <div className="memory-entry-tags">
                                    {entry.tags.length > 0 ? (
                                        entry.tags.map(tag => {
                                            const c = getTagColor(tag)
                                            return (
                                                <span
                                                    key={tag}
                                                    className="memory-tag"
                                                    style={{ background: c.bg, color: c.fg }}
                                                >
                                                    {tag}
                                                </span>
                                            )
                                        })
                                    ) : (
                                        <span className="memory-tag memory-tag-untagged">{t('memory.untagged')}</span>
                                    )}
                                </div>
                                {entry.content && (
                                    <div className="memory-entry-content">{entry.content}</div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}
