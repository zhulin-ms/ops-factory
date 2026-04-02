import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMemory } from '../../hooks/useMemory'
import { useToast } from '../../contexts/ToastContext'
import MemoryFileCard from './MemoryFileCard'
import './Memory.css'
import '../prompt/PromptsSection.css'

interface MemorySectionProps {
    agentId: string | null
}

const CATEGORY_REGEX = /^[a-zA-Z0-9_-]+$/

export default function MemorySection({ agentId }: MemorySectionProps) {
    const { t } = useTranslation()
    const { showToast } = useToast()
    const { files, isLoading, error, fetchMemory, saveFile, deleteFile, createFile } = useMemory()

    const [showNewModal, setShowNewModal] = useState(false)
    const [newCategory, setNewCategory] = useState('')
    const [newCategoryError, setNewCategoryError] = useState('')
    const [recentlyCreated, setRecentlyCreated] = useState<string | null>(null)
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

    useEffect(() => {
        if (agentId) {
            fetchMemory(agentId)
        }
    }, [agentId, fetchMemory])

    const handleCreate = async () => {
        const cat = newCategory.trim()
        if (!cat) {
            setNewCategoryError(t('memory.categoryRequired'))
            return
        }
        if (!CATEGORY_REGEX.test(cat)) {
            setNewCategoryError(t('memory.categoryInvalid'))
            return
        }
        if (files.some(f => f.category === cat)) {
            setNewCategoryError(t('memory.categoryExists'))
            return
        }
        if (!agentId) return
        const ok = await createFile(agentId, cat)
        if (ok) {
            setShowNewModal(false)
            setNewCategory('')
            setNewCategoryError('')
            setRecentlyCreated(cat)
        } else {
            showToast('error', t('memory.createFailed'))
        }
    }

    const handleSave = async (category: string, content: string): Promise<boolean> => {
        if (!agentId) return false
        const ok = await saveFile(agentId, category, content)
        if (ok) {
            showToast('success', t('memory.saved'))
            setRecentlyCreated(null)
        } else {
            showToast('error', t('memory.saveFailed'))
        }
        return ok
    }

    const handleDelete = async (category: string) => {
        if (deleteConfirm !== category) {
            setDeleteConfirm(category)
            return
        }
        if (!agentId) return
        const ok = await deleteFile(agentId, category)
        if (ok) {
            showToast('success', t('memory.deleted'))
        } else {
            showToast('error', t('memory.deleteFailed'))
        }
        setDeleteConfirm(null)
    }

    if (isLoading) {
        return <div className="prompts-loading">{t('memory.loading')}</div>
    }

    if (error) {
        return <div className="prompts-alert prompts-alert-error">{error}</div>
    }

    return (
        <div className="memory-section">
            <div className="prompts-section-header">
                <div>
                    <h2 className="prompts-section-title">{t('memory.title')}</h2>
                    <p className="prompts-section-desc">{t('memory.description')}</p>
                </div>
                <button
                    type="button"
                    className="action-btn-primary btn btn-secondary"
                    onClick={() => { setShowNewModal(true); setNewCategory(''); setNewCategoryError('') }}
                >
                    {t('memory.newFile')}
                </button>
            </div>

            {files.length === 0 ? (
                <div className="prompts-empty">{t('memory.noFiles')}</div>
            ) : (
                <div className="memory-file-list">
                    {files.map(file => (
                        <MemoryFileCard
                            key={file.category}
                            category={file.category}
                            content={file.content}
                            onSave={(content) => handleSave(file.category, content)}
                            onDelete={() => handleDelete(file.category)}
                            autoEdit={recentlyCreated === file.category}
                        />
                    ))}
                </div>
            )}

            {/* New File Modal — same structure as Create Agent modal */}
            {showNewModal && (
                <div className="modal-overlay" onClick={() => setShowNewModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">{t('memory.newFileTitle')}</h2>
                            <button type="button" className="modal-close" onClick={() => setShowNewModal(false)}>&times;</button>
                        </div>

                        <div className="modal-body">
                            {newCategoryError && (
                                <div className="agents-alert agents-alert-error" style={{ marginBottom: 'var(--spacing-4)' }}>
                                    {newCategoryError}
                                </div>
                            )}
                            <div className="form-group">
                                <label className="form-label">{t('memory.categoryName')}</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={newCategory}
                                    onChange={e => { setNewCategory(e.target.value); setNewCategoryError('') }}
                                    placeholder="development"
                                    autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                                />
                                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--spacing-1)' }}>
                                    {t('memory.categoryHint')}
                                </p>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" onClick={() => setShowNewModal(false)}>
                                {t('common.cancel')}
                            </button>
                            <button type="button" className="btn btn-primary" onClick={handleCreate}>
                                {t('memory.create')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
