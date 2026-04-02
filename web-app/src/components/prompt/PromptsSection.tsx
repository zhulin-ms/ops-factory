import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { usePrompts } from '../../hooks/usePrompts'
import { useToast } from '../../contexts/ToastContext'
import type { SystemPromptContent } from '../../types/systemPrompt'
import './PromptsSection.css'

interface PromptsSectionProps {
    agentId: string | null
}

export default function PromptsSection({ agentId }: PromptsSectionProps) {
    const { t } = useTranslation()
    const { showToast } = useToast()
    const {
        templates,
        isLoading,
        error,
        fetchPrompts,
        getPrompt,
        savePrompt,
        resetPrompt,
        resetAllPrompts,
    } = usePrompts(agentId)

    // Editing state
    const [expandedName, setExpandedName] = useState<string | null>(null)
    const [editContent, setEditContent] = useState('')
    const [promptData, setPromptData] = useState<SystemPromptContent | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [isResetting, setIsResetting] = useState(false)
    const [isLoadingPrompt, setIsLoadingPrompt] = useState(false)
    const [hasChanges, setHasChanges] = useState(false)

    useEffect(() => {
        if (agentId) {
            fetchPrompts()
        }
    }, [agentId, fetchPrompts])

    const handleExpand = useCallback(async (name: string) => {
        if (expandedName === name) {
            setExpandedName(null)
            setPromptData(null)
            setEditContent('')
            setHasChanges(false)
            return
        }

        setIsLoadingPrompt(true)
        setExpandedName(name)

        const data = await getPrompt(name)
        if (data) {
            setPromptData(data)
            setEditContent(data.content)
            setHasChanges(false)
        }

        setIsLoadingPrompt(false)
    }, [expandedName, getPrompt])

    const handleContentChange = (value: string) => {
        setEditContent(value)
        setHasChanges(value !== promptData?.content)
    }

    const handleSave = async () => {
        if (!expandedName) return
        setIsSaving(true)

        const success = await savePrompt(expandedName, editContent)
        if (success) {
            showToast('success', t('prompts.saved'))
            setPromptData(prev => prev ? { ...prev, content: editContent, is_customized: true } : prev)
            setHasChanges(false)
        } else {
            showToast('error', t('prompts.saveFailed'))
        }

        setIsSaving(false)
    }

    const handleRestoreDefault = () => {
        if (promptData) {
            setEditContent(promptData.default_content)
            setHasChanges(promptData.default_content !== promptData.content)
        }
    }

    const handleReset = async () => {
        if (!expandedName) return
        setIsResetting(true)

        const success = await resetPrompt(expandedName)
        if (success) {
            showToast('success', t('prompts.resetSuccess'))
            if (promptData) {
                setEditContent(promptData.default_content)
                setPromptData({ ...promptData, content: promptData.default_content, is_customized: false })
                setHasChanges(false)
            }
        } else {
            showToast('error', t('prompts.resetFailed'))
        }

        setIsResetting(false)
    }

    const handleResetAll = async () => {
        const customizedCount = templates.filter(t => t.is_customized).length
        if (customizedCount === 0) return

        const success = await resetAllPrompts()
        if (success) {
            showToast('success', t('prompts.resetAllSuccess'))
            // Collapse editor
            setExpandedName(null)
            setPromptData(null)
            setEditContent('')
            setHasChanges(false)
        } else {
            showToast('error', t('prompts.resetAllFailed'))
        }
    }

    if (!agentId) return null

    const customizedCount = templates.filter(t => t.is_customized).length

    return (
        <div className="prompts-section">
            <div className="prompts-section-header">
                <h3 className="prompts-section-title">{t('prompts.title')}</h3>
                {customizedCount > 0 && (
                    <button
                        type="button"
                        className="prompts-reset-all-btn"
                        onClick={handleResetAll}
                    >
                        {t('prompts.resetAll')}
                    </button>
                )}
            </div>

            <p className="prompts-section-desc">{t('prompts.description')}</p>

            <div className="prompts-warning">
                {t('prompts.templateWarning')}
            </div>

            {error && (
                <div className="prompts-alert prompts-alert-error">{error}</div>
            )}

            {isLoading ? (
                <div className="prompts-loading">{t('prompts.loading')}</div>
            ) : templates.length > 0 ? (
                <div className="prompts-list">
                    {templates.map(template => {
                        const isExpanded = expandedName === template.name
                        return (
                            <div
                                key={template.name}
                                className={`prompts-item ${isExpanded ? 'prompts-item-expanded' : ''}`}
                            >
                                <div
                                    className="prompts-item-header"
                                    onClick={() => handleExpand(template.name)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            handleExpand(template.name)
                                        }
                                    }}
                                >
                                    <div className="prompts-item-info">
                                        <div className="prompts-item-name-row">
                                            <span className="prompts-item-name">{template.name}</span>
                                            {template.is_customized && (
                                                <span className="prompts-customized-badge">
                                                    {t('prompts.customized')}
                                                </span>
                                            )}
                                        </div>
                                        <span className="prompts-item-desc">{template.description}</span>
                                    </div>
                                    <button
                                        type="button"
                                        className="prompts-edit-btn"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleExpand(template.name)
                                        }}
                                    >
                                        {isExpanded ? t('prompts.collapse') : t('common.edit')}
                                    </button>
                                </div>

                                {isExpanded && (
                                    <div className="prompts-item-editor">
                                        {isLoadingPrompt ? (
                                            <div className="prompts-loading">{t('common.loading')}</div>
                                        ) : (
                                            <>
                                                <textarea
                                                    className="prompts-textarea"
                                                    value={editContent}
                                                    onChange={(e) => handleContentChange(e.target.value)}
                                                    rows={16}
                                                    spellCheck={false}
                                                />
                                                <div className="prompts-editor-actions">
                                                    <div className="prompts-editor-actions-left">
                                                        <button
                                                            type="button"
                                                            className="btn btn-secondary"
                                                            onClick={handleRestoreDefault}
                                                            disabled={editContent === promptData?.default_content}
                                                        >
                                                            {t('prompts.restoreDefault')}
                                                        </button>
                                                        {promptData?.is_customized && (
                                                            <button
                                                                type="button"
                                                                className="btn btn-danger-text"
                                                                onClick={handleReset}
                                                                disabled={isResetting}
                                                            >
                                                                {isResetting ? t('common.loading') : t('prompts.resetToDefault')}
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="prompts-editor-actions-right">
                                                        <button
                                                            type="button"
                                                            className="btn btn-secondary"
                                                            onClick={() => handleExpand(template.name)}
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
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="prompts-empty">
                    <p>{t('prompts.noPrompts')}</p>
                </div>
            )}
        </div>
    )
}
