import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useCommandWhitelist } from '../hooks/useCommandWhitelist'
import { useToast } from '../../../platform/providers/ToastContext'
import type { WhitelistCommand } from '../../../../types/commandWhitelist'

function TrashIcon() {
    return (
        <svg viewBox="0 0 20 20" fill="none" width="18" height="18" aria-hidden="true">
            <path
                d="M6.5 5.5h7m-6 0V4.75A1.75 1.75 0 0 1 9.25 3h1.5A1.75 1.75 0 0 1 12.5 4.75v.75m-8 0h11m-1 0-.6 8.39a1.75 1.75 0 0 1-1.75 1.61H7.85A1.75 1.75 0 0 1 6.1 13.89L5.5 5.5m2.75 2.5v4m4-4v4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    )
}

// ---------------------------------------------------------------------------
// Whitelist Form Modal
// ---------------------------------------------------------------------------

function WhitelistFormModal({
    command,
    onClose,
    onSave,
}: {
    command: WhitelistCommand | null
    onClose: () => void
    onSave: (data: WhitelistCommand) => Promise<void>
}) {
    const { t } = useTranslation()
    const [pattern, setPattern] = useState(command?.pattern ?? '')
    const [description, setDescription] = useState(command?.description ?? '')
    const [enabled, setEnabled] = useState(command?.enabled ?? true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSave = useCallback(async () => {
        setError(null)
        if (!pattern.trim()) {
            setError(t('remoteDiagnosis.whitelist.patternRequired'))
            return
        }

        setSaving(true)
        try {
            await onSave({
                pattern: pattern.trim(),
                description: description.trim(),
                enabled,
            })
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setSaving(false)
        }
    }, [pattern, description, enabled, onSave, t])

    return (
        <div className="modal-overlay">
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
                <div className="modal-header">
                    <h2 className="modal-title">
                        {command
                            ? t('remoteDiagnosis.whitelist.editCommand')
                            : t('remoteDiagnosis.whitelist.addCommand')}
                    </h2>
                    <button className="modal-close" onClick={onClose}>
                        &times;
                    </button>
                </div>

                <div className="modal-body">
                    {error && (
                        <div
                            className="agents-alert agents-alert-error"
                            style={{ marginBottom: 'var(--spacing-4)' }}
                        >
                            {error}
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label">{t('remoteDiagnosis.whitelist.pattern')}</label>
                        <input
                            className="form-input"
                            type="text"
                            value={pattern}
                            onChange={e => setPattern(e.target.value)}
                            placeholder="ps aux"
                            autoFocus
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">{t('remoteDiagnosis.whitelist.description')}</label>
                        <textarea
                            className="form-input"
                            rows={2}
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Describe what this command does"
                        />
                    </div>

                    <div className="form-group">
                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--spacing-3)',
                                cursor: 'pointer',
                                fontSize: 'var(--font-size-sm)',
                                color: 'var(--color-text-secondary)',
                            }}
                        >
                            <div className="toggle-switch">
                                <input
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={e => setEnabled(e.target.checked)}
                                    style={{ display: 'none' }}
                                />
                                <span
                                    className="toggle-slider"
                                    style={{
                                        display: 'inline-block',
                                        width: 36,
                                        height: 20,
                                        borderRadius: 10,
                                        background: enabled ? 'var(--color-success)' : 'var(--color-border)',
                                        position: 'relative',
                                        transition: 'background var(--transition-fast)',
                                        cursor: 'pointer',
                                        flexShrink: 0,
                                    }}
                                    onClick={() => setEnabled(prev => !prev)}
                                >
                                    <span
                                        style={{
                                            position: 'absolute',
                                            top: 2,
                                            left: enabled ? 18 : 2,
                                            width: 16,
                                            height: 16,
                                            borderRadius: '50%',
                                            background: '#fff',
                                            transition: 'left var(--transition-fast)',
                                            boxShadow: 'var(--shadow-sm)',
                                        }}
                                    />
                                </span>
                            </div>
                            {t('remoteDiagnosis.whitelist.enabled')}
                        </label>
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
                        {t('common.cancel')}
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleSave}
                        disabled={saving || !pattern.trim()}
                    >
                        {saving ? t('common.saving') : t('common.save')}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Toggle Switch (inline in table)
// ---------------------------------------------------------------------------

function ToggleSwitch({
    checked,
    onChange,
}: {
    checked: boolean
    onChange: (value: boolean) => void
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            className={`sop-workflow-switch${checked ? ' is-on' : ''}`}
            onClick={() => onChange(!checked)}
            onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onChange(!checked)
                }
            }}
        >
            <span className="sop-workflow-switch-thumb" />
        </button>
    )
}

// ---------------------------------------------------------------------------
// Whitelist Tab (content only, no page wrapper)
// ---------------------------------------------------------------------------

export function WhitelistTab() {
    const { t } = useTranslation()
    const {
        commands,
        isLoading,
        error,
        fetchWhitelist: fetchCommands,
        addCommand: createCommand,
        updateCommand,
        deleteCommand,
    } = useCommandWhitelist()
    const { showToast } = useToast()

    const PAGE_SIZE = 15
    const [currentPage, setCurrentPage] = useState(1)
    const [editingCommand, setEditingCommand] = useState<WhitelistCommand | null>(null)
    const [showAddModal, setShowAddModal] = useState(false)

    useEffect(() => {
        fetchCommands()
    }, [fetchCommands])

    const handleSaveCommand = useCallback(
        async (data: WhitelistCommand) => {
            if (editingCommand) {
                await updateCommand(editingCommand.pattern, data)
                showToast('success', t('remoteDiagnosis.whitelist.editSuccess', { pattern: data.pattern }))
            } else {
                await createCommand(data)
                showToast('success', t('remoteDiagnosis.whitelist.addSuccess', { pattern: data.pattern }))
            }
            setShowAddModal(false)
            setEditingCommand(null)
            await fetchCommands()
        },
        [editingCommand, updateCommand, createCommand, fetchCommands, showToast, t],
    )

    const handleToggleEnabled = useCallback(
        async (cmd: WhitelistCommand) => {
            try {
                await updateCommand(cmd.pattern, { ...cmd, enabled: !cmd.enabled })
                showToast(
                    'success',
                    cmd.enabled
                        ? t('remoteDiagnosis.whitelist.disabled')
                        : t('remoteDiagnosis.whitelist.enabled'),
                )
                await fetchCommands()
            } catch (err) {
                showToast('error', err instanceof Error ? err.message : 'Update failed')
            }
        },
        [updateCommand, fetchCommands, showToast, t],
    )

    const handleDelete = useCallback(
        (cmd: WhitelistCommand) => {
            const confirmed = window.confirm(
                t('remoteDiagnosis.whitelist.deleteConfirm', { pattern: cmd.pattern }),
            )
            if (!confirmed) return
            deleteCommand(cmd.pattern)
                .then(() => {
                    showToast(
                        'success',
                        t('remoteDiagnosis.whitelist.deleteSuccess', { pattern: cmd.pattern }),
                    )
                    fetchCommands()
                })
                .catch((err: unknown) => {
                    showToast('error', err instanceof Error ? err.message : 'Delete failed')
                })
        },
        [deleteCommand, fetchCommands, showToast, t],
    )

    return (
        <>
            <section className="knowledge-section-card sop-workflow-section-card">
                <div className="knowledge-section-header sop-workflow-section-header">
                    <div>
                        <h2 className="knowledge-section-title">
                            {t('remoteDiagnosis.whitelist.title')}
                        </h2>
                        <p className="knowledge-section-description">
                            {t('remoteDiagnosis.whitelist.subtitle')}
                        </p>
                    </div>
                    <div className="knowledge-doc-toolbar-actions sop-workflow-toolbar-actions">
                        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                            {t('remoteDiagnosis.whitelist.addCommand')}
                        </button>
                    </div>
                </div>

                {error && <div className="conn-banner conn-banner-error">{error}</div>}

                {isLoading ? (
                    <div className="sop-workflow-empty-shell">
                        <div className="empty-state">
                            <h3 className="empty-state-title">{t('common.loading')}</h3>
                        </div>
                    </div>
                ) : commands.length === 0 ? (
                    <div className="sop-workflow-empty-shell">
                        <div className="empty-state">
                            <svg
                                className="empty-state-icon"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                            >
                                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            <h3 className="empty-state-title">
                                {t('remoteDiagnosis.whitelist.noCommands')}
                            </h3>
                            <p className="empty-state-description">
                                {t('remoteDiagnosis.whitelist.noCommandsHint')}
                            </p>
                        </div>
                    </div>
                ) : (
                    (() => {
                        const totalPages = Math.max(1, Math.ceil(commands.length / PAGE_SIZE))
                        const safePage = Math.min(currentPage, totalPages)
                        const paginatedCommands = commands.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
                        return <>
                    <div className="sop-workflow-list-shell">
                        <div className="sop-workflow-table-wrap">
                            <table className="sop-workflow-table">
                                <thead>
                                    <tr>
                                        <th>{t('remoteDiagnosis.whitelist.pattern')}</th>
                                        <th>{t('remoteDiagnosis.whitelist.description')}</th>
                                        <th style={{ textAlign: 'center' }}>
                                            {t('remoteDiagnosis.whitelist.enabled')}
                                        </th>
                                        <th style={{ textAlign: 'right' }}>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedCommands.map(cmd => (
                                        <tr key={cmd.pattern} className="sop-workflow-table-row">
                                            <td>
                                                <code className="sop-workflow-code-pill">
                                                    {cmd.pattern}
                                                </code>
                                            </td>
                                            <td className="sop-workflow-muted-text">
                                                {cmd.description || '--'}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <ToggleSwitch
                                                    checked={cmd.enabled}
                                                    onChange={() => handleToggleEnabled(cmd)}
                                                />
                                            </td>
                                            <td>
                                                <div className="sop-workflow-table-actions">
                                                    <button
                                                        type="button"
                                                        className="btn btn-subtle"
                                                        onClick={() => {
                                                            setEditingCommand(cmd)
                                                            setShowAddModal(true)
                                                        }}
                                                    >
                                                        {t('common.edit')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="knowledge-doc-action-btn knowledge-doc-action-icon danger"
                                                        onClick={() => handleDelete(cmd)}
                                                        aria-label={t('common.delete')}
                                                    >
                                                        <TrashIcon />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    {totalPages > 1 && (
                        <div className="sop-workflow-pagination">
                            <span className="sop-workflow-pagination-info">
                                {t('common.showing', {
                                    start: (safePage - 1) * PAGE_SIZE + 1,
                                    end: Math.min(safePage * PAGE_SIZE, commands.length),
                                    total: commands.length,
                                })}
                            </span>
                            <div className="sop-workflow-pagination-controls">
                                <button className="sop-workflow-pagination-btn"
                                    disabled={safePage <= 1}
                                    onClick={() => setCurrentPage(safePage - 1)}>
                                    {t('common.previousPage')}
                                </button>
                                <span className="sop-workflow-pagination-page">{safePage} / {totalPages}</span>
                                <button className="sop-workflow-pagination-btn"
                                    disabled={safePage >= totalPages}
                                    onClick={() => setCurrentPage(safePage + 1)}>
                                    {t('common.nextPage')}
                                </button>
                            </div>
                        </div>
                    )}
                </>
                    })()
                )}
            </section>

            {(showAddModal || editingCommand) && (
                <WhitelistFormModal
                    command={editingCommand}
                    onClose={() => {
                        setShowAddModal(false)
                        setEditingCommand(null)
                    }}
                    onSave={handleSaveCommand}
                />
            )}
        </>
    )
}
