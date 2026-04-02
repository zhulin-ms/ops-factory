import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSops } from '../../hooks/useSops'
import { useCommandWhitelist } from '../../hooks/useCommandWhitelist'
import { useToast } from '../../contexts/ToastContext'
import type { Sop, SopNode, SopCreateRequest } from '../../types/sop'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEmptyNode(index: number): SopNode {
    return {
        id: `node-${Date.now()}-${index}`,
        name: '',
        type: 'start',
        hostTags: [],
        command: '',
        commandVariables: {},
        variables: [],
        outputFormat: '',
        analysisInstruction: '',
        transitions: [],
        browserUrl: '',
        browserAction: '',
        browserMode: 'headless',
    }
}

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
// Variable Editor (inline sub-component)
// ---------------------------------------------------------------------------

function VariableEditor({
    variables,
    onChange,
}: {
    variables: NonNullable<SopNode['variables']>
    onChange: (v: NonNullable<SopNode['variables']>) => void
}) {
    const { t } = useTranslation()

    const addVar = useCallback(() => {
        onChange([...variables, { name: '', defaultValue: '', description: '', required: false }])
    }, [variables, onChange])

    const removeVar = useCallback(
        (index: number) => {
            onChange(variables.filter((_, i: number) => i !== index))
        },
        [variables, onChange],
    )

    const updateVar = useCallback(
        (index: number, field: string, value: string | boolean) => {
            const next = [...variables]
            next[index] = { ...next[index], [field]: value }
            onChange(next)
        },
        [variables, onChange],
    )

    return (
        <div className="remote-diagnosis-inline-editor">
            <div className="remote-diagnosis-inline-editor-head">
                <p className="remote-diagnosis-inline-editor-title">
                    {t('remoteDiagnosis.sops.nodeVariables')}
                </p>
                <button
                    type="button"
                    className="btn btn-subtle remote-diagnosis-inline-add"
                    onClick={addVar}
                >
                    + {t('remoteDiagnosis.sops.addNode')}
                </button>
            </div>
            {variables.map((v, i: number) => (
                <div key={i} className="remote-diagnosis-inline-row">
                    <input
                        className="form-input"
                        placeholder={t('remoteDiagnosis.sops.varName')}
                        value={v.name}
                        onChange={e => updateVar(i, 'name', e.target.value)}
                    />
                    <input
                        className="form-input"
                        placeholder={t('remoteDiagnosis.sops.varDefault')}
                        value={v.defaultValue ?? ''}
                        onChange={e => updateVar(i, 'defaultValue', e.target.value)}
                    />
                    <input
                        className="form-input"
                        placeholder={t('remoteDiagnosis.sops.varDesc')}
                        value={v.description ?? ''}
                        onChange={e => updateVar(i, 'description', e.target.value)}
                    />
                    <label className="remote-diagnosis-next-option">
                        <input
                            type="checkbox"
                            checked={v.required ?? false}
                            onChange={e => updateVar(i, 'required', e.target.checked)}
                        />
                        {t('remoteDiagnosis.sops.varRequired')}
                    </label>
                    <button
                        type="button"
                        className="knowledge-doc-action-btn knowledge-doc-action-icon danger remote-diagnosis-inline-remove"
                        onClick={() => removeVar(i)}
                        title={t('remoteDiagnosis.sops.removeNode')}
                    >
                        <TrashIcon />
                    </button>
                </div>
            ))}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Transition Editor (inline sub-component)
// ---------------------------------------------------------------------------

function TransitionEditor({
    transitions,
    nodeNames,
    onChange,
}: {
    transitions: SopNode['transitions']
    nodeNames: string[]
    onChange: (t: SopNode['transitions']) => void
}) {
    const { t } = useTranslation()

    const addTransition = useCallback(() => {
        onChange([...transitions, { condition: '', description: '', nextNodes: [] }])
    }, [transitions, onChange])

    const removeTransition = useCallback(
        (index: number) => {
            onChange(transitions.filter((_, i) => i !== index))
        },
        [transitions, onChange],
    )

    const updateTransitionCondition = useCallback(
        (index: number, value: string) => {
            const next = [...transitions]
            next[index] = { ...next[index], condition: value }
            onChange(next)
        },
        [transitions, onChange],
    )

    const toggleNextNode = useCallback(
        (index: number, nodeName: string) => {
            const next = [...transitions]
            const current = next[index].nextNodes ?? []
            const updated = current.includes(nodeName)
                ? current.filter(n => n !== nodeName)
                : [...current, nodeName]
            next[index] = { ...next[index], nextNodes: updated }
            onChange(next)
        },
        [transitions, onChange],
    )

    return (
        <div className="remote-diagnosis-inline-editor">
            <div className="remote-diagnosis-inline-editor-head">
                <p className="remote-diagnosis-inline-editor-title">
                    {t('remoteDiagnosis.sops.nodeTransitions')}
                </p>
                <button
                    type="button"
                    className="btn btn-subtle remote-diagnosis-inline-add"
                    onClick={addTransition}
                >
                    + {t('remoteDiagnosis.sops.addNode')}
                </button>
            </div>
            {transitions.map((tr, i) => (
                <div key={i} className="remote-diagnosis-transition-card">
                    <div className="remote-diagnosis-transition-head">
                        <input
                            className="form-input"
                            placeholder={t('remoteDiagnosis.sops.transitionCondition')}
                            value={tr.condition}
                            onChange={e => updateTransitionCondition(i, e.target.value)}
                        />
                        <button
                            type="button"
                            className="knowledge-doc-action-btn knowledge-doc-action-icon danger remote-diagnosis-inline-remove"
                            onClick={() => removeTransition(i)}
                            title={t('remoteDiagnosis.sops.removeNode')}
                        >
                            <TrashIcon />
                        </button>
                    </div>
                    {nodeNames.length > 0 && (
                        <div className="remote-diagnosis-next-nodes">
                            <span className="remote-diagnosis-next-label">
                                {t('remoteDiagnosis.sops.transitionNext')}:
                            </span>
                            {nodeNames.map(name => {
                                const checked = (tr.nextNodes ?? []).includes(name)
                                return (
                                    <label key={name} className="remote-diagnosis-next-option">
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleNextNode(i, name)}
                                        />
                                        {name}
                                    </label>
                                )
                            })}
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}

// ---------------------------------------------------------------------------
// SOP Form Modal
// ---------------------------------------------------------------------------

function SopFormModal({
    sop,
    onClose,
    onSave,
}: {
    sop: Sop | null
    onClose: () => void
    onSave: (data: SopCreateRequest) => Promise<void>
}) {
    const { t } = useTranslation()
    const { commands } = useCommandWhitelist()
    const [name, setName] = useState(sop?.name ?? '')
    const [description, setDescription] = useState(sop?.description ?? '')
    const [version, setVersion] = useState(sop?.version ?? '1.0')
    const [triggerCondition, setTriggerCondition] = useState(sop?.triggerCondition ?? '')
    const [nodes, setNodes] = useState<SopNode[]>(sop?.nodes?.length ? sop.nodes : [createEmptyNode(0)])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [commandErrors, setCommandErrors] = useState<Record<number, string>>({})

    const nodeNames = useMemo(() => nodes.map(n => n.name).filter(Boolean), [nodes])

    const validateNodeCommand = useCallback((command: string): string[] => {
        if (!command.trim()) return []
        const enabledPatterns = commands
            .filter(c => c.enabled)
            .map(c => c.pattern)
        const rejected: string[] = []
        command.split(/[|;]/).forEach(sub => {
            const trimmed = sub.trim()
            if (!trimmed) return
            const cmdName = trimmed.split(/\s+/)[0]
            if (!cmdName) return
            const allowed = enabledPatterns.some(p => {
                const patternCmd = p.split(/\s+/)[0]
                return patternCmd === cmdName || p === cmdName
            })
            if (!allowed) rejected.push(cmdName)
        })
        return rejected
    }, [commands])

    const handleAddNode = useCallback(() => {
        setNodes(prev => [...prev, createEmptyNode(prev.length)])
    }, [])

    const handleRemoveNode = useCallback((index: number) => {
        setNodes(prev => prev.filter((_, i) => i !== index))
    }, [])

    const handleNodeChange = useCallback((index: number, field: keyof SopNode, value: unknown) => {
        setNodes(prev => {
            const next = [...prev]
            next[index] = { ...next[index], [field]: value }
            return next
        })
    }, [])

    const handleSave = useCallback(async () => {
        setError(null)
        setCommandErrors({})
        if (!name.trim()) {
            setError(t('remoteDiagnosis.hosts.nameRequired'))
            return
        }

        // Validate all node commands against whitelist (skip browser nodes)
        const errors: Record<number, string> = {}
        nodes.forEach((node, idx) => {
            if (node.type === 'browser') return
            const rejected = validateNodeCommand(node.command || '')
            if (rejected.length > 0) {
                errors[idx] = t('remoteDiagnosis.sops.commandNotInWhitelist', { commands: rejected.join(', ') })
            }
        })
        if (Object.keys(errors).length > 0) {
            setCommandErrors(errors)
            return
        }

        setSaving(true)
        try {
            await onSave({
                name: name.trim(),
                description: description.trim(),
                version: version.trim(),
                triggerCondition: triggerCondition.trim(),
                nodes,
            })
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setSaving(false)
        }
    }, [name, description, version, triggerCondition, nodes, onSave, t, validateNodeCommand])

    return (
        <div className="modal-overlay">
            <div
                className="modal remote-diagnosis-modal-wide"
                onClick={e => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h2 className="modal-title">
                        {sop ? t('remoteDiagnosis.sops.editSop') : t('remoteDiagnosis.sops.addSop')}
                    </h2>
                    <button className="modal-close" onClick={onClose}>
                        &times;
                    </button>
                </div>

                <div className="modal-body remote-diagnosis-modal-body">
                    {error && (
                        <div className="agents-alert agents-alert-error">
                            {error}
                        </div>
                    )}

                    <section className="knowledge-section-card remote-diagnosis-form-section">
                        <div className="knowledge-section-header knowledge-section-header-compact">
                            <div>
                                <h3 className="knowledge-section-title">
                                    {t('remoteDiagnosis.sops.editSop')}
                                </h3>
                                <p className="knowledge-section-description">
                                    {t('remoteDiagnosis.sops.subtitle')}
                                </p>
                            </div>
                        </div>

                        <div className="remote-diagnosis-modal-grid">
                            <div className="form-group">
                                <label className="form-label">{t('remoteDiagnosis.sops.name')}</label>
                                <input
                                    className="form-input"
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">{t('remoteDiagnosis.sops.version')}</label>
                                <input
                                    className="form-input"
                                    type="text"
                                    value={version}
                                    onChange={e => setVersion(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="form-label">{t('remoteDiagnosis.sops.description')}</label>
                            <textarea
                                className="form-input"
                                rows={2}
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">
                                {t('remoteDiagnosis.sops.triggerCondition')}
                            </label>
                            <input
                                className="form-input"
                                type="text"
                                value={triggerCondition}
                                onChange={e => setTriggerCondition(e.target.value)}
                            />
                        </div>
                    </section>

                    <section className="knowledge-section-card remote-diagnosis-node-editor">
                        <div className="remote-diagnosis-node-editor-head">
                            <div className="remote-diagnosis-node-editor-copy">
                                <h3 className="remote-diagnosis-node-editor-title">
                                    {t('remoteDiagnosis.sops.nodeEditor')}
                                </h3>
                                <p className="remote-diagnosis-node-editor-description">
                                    {t('remoteDiagnosis.sops.subtitle')}
                                </p>
                            </div>
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={handleAddNode}
                            >
                                {t('remoteDiagnosis.sops.addNode')}
                            </button>
                        </div>
                        {nodes.map((node, idx) => (
                            <div key={node.id} className="remote-diagnosis-node-surface">
                                <div className="remote-diagnosis-node-surface-head">
                                    <span className="remote-diagnosis-node-index">
                                        #{idx + 1}
                                    </span>
                                    {nodes.length > 1 && (
                                        <button
                                            type="button"
                                            className="btn btn-quiet-danger remote-diagnosis-inline-danger"
                                            onClick={() => handleRemoveNode(idx)}
                                        >
                                            {t('remoteDiagnosis.sops.removeNode')}
                                        </button>
                                    )}
                                </div>

                                <div className="remote-diagnosis-modal-grid">
                                    <div className="form-group remote-diagnosis-compact-field">
                                        <label className="form-label">{t('remoteDiagnosis.sops.nodeName')}</label>
                                        <input
                                            className="form-input"
                                            value={node.name}
                                            onChange={e => handleNodeChange(idx, 'name', e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group remote-diagnosis-compact-field">
                                        <label className="form-label">{t('remoteDiagnosis.sops.nodeType')}</label>
                                        <select
                                            className="form-input"
                                            value={node.type}
                                            onChange={e => handleNodeChange(idx, 'type', e.target.value)}
                                        >
                                            <option value="start">{t('remoteDiagnosis.sops.startNode')}</option>
                                            <option value="analysis">{t('remoteDiagnosis.sops.analysisNode')}</option>
                                            <option value="browser">{t('remoteDiagnosis.sops.browserNode')}</option>
                                        </select>
                                    </div>
                                </div>

                                {node.type === 'browser' ? (
                                    <>
                                        <div className="form-group remote-diagnosis-compact-field">
                                            <label className="form-label">{t('remoteDiagnosis.sops.browserUrl')}</label>
                                            <input
                                                className="form-input"
                                                placeholder="https://example.com"
                                                value={node.browserUrl ?? ''}
                                                onChange={e => handleNodeChange(idx, 'browserUrl', e.target.value)}
                                            />
                                        </div>
                                        <div className="form-group remote-diagnosis-compact-field">
                                            <label className="form-label">{t('remoteDiagnosis.sops.browserAction')}</label>
                                            <textarea
                                                className="form-input"
                                                rows={3}
                                                placeholder={t('remoteDiagnosis.sops.browserActionPlaceholder')}
                                                value={node.browserAction ?? ''}
                                                onChange={e => handleNodeChange(idx, 'browserAction', e.target.value)}
                                            />
                                        </div>
                                        <div className="form-group remote-diagnosis-compact-field">
                                            <label className="form-label">{t('remoteDiagnosis.sops.browserMode')}</label>
                                            <select
                                                className="form-input"
                                                value={node.browserMode ?? 'headless'}
                                                onChange={e => handleNodeChange(idx, 'browserMode', e.target.value)}
                                            >
                                                <option value="headless">{t('remoteDiagnosis.sops.chromiumMode')}</option>
                                                <option value="headed">{t('remoteDiagnosis.sops.headedMode')}</option>
                                            </select>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="form-group remote-diagnosis-compact-field">
                                            <label className="form-label">{t('remoteDiagnosis.sops.nodeTags')}</label>
                                            <input
                                                className="form-input"
                                                placeholder="tag1, tag2"
                                                value={node.hostTags?.join(', ') ?? ''}
                                                onChange={e => {
                                                    const tags = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                                    handleNodeChange(idx, 'hostTags', tags)
                                                }}
                                            />
                                        </div>

                                        <div className="form-group remote-diagnosis-compact-field remote-diagnosis-command-field">
                                            <label className="form-label">{t('remoteDiagnosis.sops.nodeCommand')}</label>
                                            <textarea
                                                className="form-input"
                                                rows={2}
                                                value={node.command}
                                                onChange={e => {
                                                    handleNodeChange(idx, 'command', e.target.value)
                                                    setCommandErrors(prev => {
                                                        const next = { ...prev }
                                                        delete next[idx]
                                                        return next
                                                    })
                                                }}
                                            />
                                            {commandErrors[idx] && (
                                                <div className="agents-alert agents-alert-error" style={{ marginTop: '4px' }}>
                                                    {commandErrors[idx]}
                                                </div>
                                            )}
                                        </div>

                                        <VariableEditor
                                            variables={node.variables ?? []}
                                            onChange={v => handleNodeChange(idx, 'variables', v)}
                                        />
                                    </>
                                )}

                                <div className="form-group remote-diagnosis-compact-field">
                                    <label className="form-label">{t('remoteDiagnosis.sops.nodeOutputFormat')}</label>
                                    <input
                                        className="form-input"
                                        value={node.outputFormat ?? ''}
                                        onChange={e => handleNodeChange(idx, 'outputFormat', e.target.value)}
                                    />
                                </div>

                                <div className="form-group remote-diagnosis-compact-field remote-diagnosis-analysis-field">
                                    <label className="form-label">{t('remoteDiagnosis.sops.nodeAnalysis')}</label>
                                    <textarea
                                        className="form-input"
                                        rows={2}
                                        value={node.analysisInstruction ?? ''}
                                        onChange={e => handleNodeChange(idx, 'analysisInstruction', e.target.value)}
                                    />
                                </div>

                                <TransitionEditor
                                    transitions={node.transitions ?? []}
                                    nodeNames={nodeNames}
                                    onChange={tr => handleNodeChange(idx, 'transitions', tr)}
                                />
                            </div>
                        ))}
                    </section>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
                        {t('common.cancel')}
                    </button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
                        {saving ? t('common.saving') : t('common.save')}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Expandable SOP Row
// ---------------------------------------------------------------------------

function SopExpandableRow({ sop, onEdit, onDelete }: {
    sop: Sop
    onEdit: (sop: Sop) => void
    onDelete: (sop: Sop) => void
}) {
    const { t } = useTranslation()
    const [expanded, setExpanded] = useState(false)

    return (
        <>
            <tr className="remote-diagnosis-table-row">
                <td>
                    <button
                        type="button"
                        className="remote-diagnosis-expand-button"
                        onClick={() => setExpanded(prev => !prev)}
                    >
                        <svg
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className={`remote-diagnosis-expand-icon${expanded ? ' expanded' : ''}`}
                        >
                            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                        </svg>
                        <span style={{ fontWeight: 700 }}>{sop.name}</span>
                    </button>
                </td>
                <td className="remote-diagnosis-muted-text">
                    {sop.description || '—'}
                </td>
                <td>
                    {sop.triggerCondition || '—'}
                </td>
                <td style={{ textAlign: 'center' }}>
                    <span className="remote-diagnosis-count-pill">{sop.nodes?.length ?? 0}</span>
                </td>
                <td>
                    <div className="remote-diagnosis-table-actions">
                        <button
                            type="button"
                            className="btn btn-subtle"
                            onClick={() => onEdit(sop)}
                        >
                            {t('common.edit')}
                        </button>
                        <button
                            type="button"
                            className="knowledge-doc-action-btn knowledge-doc-action-icon danger"
                            onClick={() => onDelete(sop)}
                            aria-label={t('common.delete')}
                        >
                            <TrashIcon />
                        </button>
                    </div>
                </td>
            </tr>
            {expanded && (
                <tr className="remote-diagnosis-detail-row">
                    <td colSpan={5}>
                        <div className="remote-diagnosis-detail-panel">
                            {sop.nodes && sop.nodes.length > 0 ? (
                                <div className="remote-diagnosis-node-list">
                                    {sop.nodes.map((node, i) => (
                                        <div key={node.id || i} className="remote-diagnosis-node-card">
                                            <div className="remote-diagnosis-node-header">
                                                <p className="remote-diagnosis-node-name">
                                                    {node.name || `Node ${i + 1}`}
                                                </p>
                                                <span
                                                    className={`remote-diagnosis-node-type ${
                                                        node.type === 'start'
                                                            ? 'remote-diagnosis-node-type-start'
                                                            : node.type === 'browser'
                                                              ? 'remote-diagnosis-node-type-browser'
                                                              : 'remote-diagnosis-node-type-analysis'
                                                    }`}
                                                >
                                                    {node.type === 'start'
                                                        ? t('remoteDiagnosis.sops.startNode')
                                                        : node.type === 'browser'
                                                          ? t('remoteDiagnosis.sops.browserNode')
                                                          : t('remoteDiagnosis.sops.analysisNode')}
                                                </span>
                                            </div>
                                            <div className="remote-diagnosis-node-grid">
                                                {node.type === 'browser' ? (
                                                    <>
                                                        <div className="remote-diagnosis-node-item">
                                                            <span className="remote-diagnosis-node-label">
                                                                {t('remoteDiagnosis.sops.browserUrl')}
                                                            </span>
                                                            <code className="remote-diagnosis-code-pill">
                                                                {node.browserUrl || '—'}
                                                            </code>
                                                        </div>
                                                        {node.browserAction && (
                                                            <div className="remote-diagnosis-node-item" style={{ gridColumn: '1 / -1' }}>
                                                                <span className="remote-diagnosis-node-label">
                                                                    {t('remoteDiagnosis.sops.browserAction')}
                                                                </span>
                                                                <span className="remote-diagnosis-node-value">
                                                                    {node.browserAction}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <>
                                                        {node.hostTags && node.hostTags.length > 0 && (
                                                            <div className="remote-diagnosis-node-item">
                                                                <span className="remote-diagnosis-node-label">
                                                                    {t('remoteDiagnosis.sops.nodeTags')}
                                                                </span>
                                                                <div className="remote-diagnosis-host-tags">
                                                                {node.hostTags.map(tag => (
                                                                    <span key={tag} className="remote-diagnosis-meta-tag">
                                                                        {tag}
                                                                    </span>
                                                                ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        <div className="remote-diagnosis-node-item">
                                                            <span className="remote-diagnosis-node-label">
                                                                {t('remoteDiagnosis.sops.nodeCommand')}
                                                            </span>
                                                            <code className="remote-diagnosis-code-pill">
                                                                {node.command || '—'}
                                                            </code>
                                                        </div>
                                                        {node.variables && node.variables.length > 0 && (
                                                            <div className="remote-diagnosis-node-item">
                                                                <span className="remote-diagnosis-node-label">
                                                                    {t('remoteDiagnosis.sops.nodeVariables')}
                                                                </span>
                                                                <span className="remote-diagnosis-node-value">
                                                                    {node.variables.map(v => v.name).join(', ')}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                                {node.transitions && node.transitions.length > 0 && (
                                                    <div className="remote-diagnosis-node-item">
                                                        <span className="remote-diagnosis-node-label">
                                                            {t('remoteDiagnosis.sops.nodeTransitions')}
                                                        </span>
                                                        <span className="remote-diagnosis-node-value">
                                                            {node.transitions
                                                                .map(tr => `${tr.condition} -> ${tr.nextNodeId}`)
                                                                .join('; ')}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                                    No nodes defined.
                                </div>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </>
    )
}

// ---------------------------------------------------------------------------
// Sops Tab (content only, no page wrapper)
// ---------------------------------------------------------------------------

export function SopsTab() {
    const { t } = useTranslation()
    const { sops, isLoading, error, fetchSops, createSop, updateSop, deleteSop } = useSops()
    const { showToast } = useToast()

    const [editingSop, setEditingSop] = useState<Sop | null>(null)
    const [showAddModal, setShowAddModal] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        fetchSops()
    }, [fetchSops])

    const handleSaveSop = useCallback(
        async (data: SopCreateRequest) => {
            if (editingSop) {
                await updateSop(editingSop.id, data)
                showToast('success', t('remoteDiagnosis.sops.editSuccess', { name: data.name }))
            } else {
                await createSop(data)
                showToast('success', t('remoteDiagnosis.sops.addSuccess', { name: data.name }))
            }
            setShowAddModal(false)
            setEditingSop(null)
            await fetchSops()
        },
        [editingSop, updateSop, createSop, fetchSops, showToast, t],
    )

    const handleDelete = useCallback(
        (sop: Sop) => {
            const confirmed = window.confirm(
                t('remoteDiagnosis.sops.deleteConfirm', { name: sop.name }),
            )
            if (!confirmed) return
            deleteSop(sop.id)
                .then(() => {
                    showToast('success', t('remoteDiagnosis.sops.deleteSuccess', { name: sop.name }))
                    fetchSops()
                })
                .catch((err: unknown) => {
                    showToast('error', err instanceof Error ? err.message : 'Delete failed')
                })
        },
        [deleteSop, fetchSops, showToast, t],
    )

    const handleExport = useCallback(() => {
        if (sops.length === 0) {
            showToast('error', t('remoteDiagnosis.sops.noSops'))
            return
        }
        try {
            const blob = new Blob([JSON.stringify(sops, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.style.display = 'none'
            a.href = url
            a.download = 'sops-export.json'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            setTimeout(() => URL.revokeObjectURL(url), 1000)
        } catch (err) {
            showToast('error', err instanceof Error ? err.message : 'Export failed')
        }
    }, [sops, showToast, t])

    const handleImport = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = async (event) => {
                try {
                    const data = JSON.parse(event.target?.result as string)
                    const items = Array.isArray(data) ? data : [data]
                    for (const item of items) {
                        await createSop(item as SopCreateRequest)
                    }
                    showToast('success', t('remoteDiagnosis.sops.importSuccess'))
                    await fetchSops()
                } catch (err) {
                    showToast('error', err instanceof Error ? err.message : 'Import failed')
                }
            }
            reader.readAsText(file)
            e.target.value = ''
        },
        [createSop, fetchSops, showToast, t],
    )

    return (
        <>
            <section className="knowledge-section-card remote-diagnosis-section-card">
                <div className="knowledge-section-header remote-diagnosis-section-header">
                    <div>
                        <h2 className="knowledge-section-title">{t('remoteDiagnosis.sops.title')}</h2>
                        <p className="knowledge-section-description">
                            {t('remoteDiagnosis.sops.subtitle')}
                        </p>
                    </div>
                    <div className="knowledge-doc-toolbar-actions remote-diagnosis-toolbar-actions">
                        <button
                            className="btn btn-secondary"
                            onClick={handleExport}
                            disabled={sops.length === 0}
                        >
                            {t('remoteDiagnosis.sops.exportJson')}
                        </button>
                        <button
                            className="btn btn-secondary"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {t('remoteDiagnosis.sops.importJson')}
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            style={{ display: 'none' }}
                            onChange={handleImport}
                        />
                        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                            {t('remoteDiagnosis.sops.addSop')}
                        </button>
                    </div>
                </div>

                {error && <div className="conn-banner conn-banner-error">{error}</div>}

                {isLoading ? (
                    <div className="remote-diagnosis-empty-shell">
                        <div className="empty-state">
                            <h3 className="empty-state-title">{t('common.loading')}</h3>
                        </div>
                    </div>
                ) : sops.length === 0 ? (
                    <div className="remote-diagnosis-empty-shell">
                        <div className="empty-state">
                            <svg
                                className="empty-state-icon"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                            >
                                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            <h3 className="empty-state-title">{t('remoteDiagnosis.sops.noSops')}</h3>
                            <p className="empty-state-description">
                                {t('remoteDiagnosis.sops.noSopsHint')}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="remote-diagnosis-list-shell">
                        <div className="remote-diagnosis-table-wrap">
                            <table className="remote-diagnosis-table">
                                <thead>
                                    <tr>
                                        <th>{t('remoteDiagnosis.sops.name')}</th>
                                        <th>{t('remoteDiagnosis.sops.description')}</th>
                                        <th>{t('remoteDiagnosis.sops.triggerCondition')}</th>
                                        <th style={{ textAlign: 'center' }}>
                                            {t('remoteDiagnosis.sops.nodes')}
                                        </th>
                                        <th style={{ textAlign: 'right' }}>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sops.map(sop => (
                                        <SopExpandableRow
                                            key={sop.id}
                                            sop={sop}
                                            onEdit={s => {
                                                setEditingSop(s)
                                                setShowAddModal(true)
                                            }}
                                            onDelete={handleDelete}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </section>

            {(showAddModal || editingSop) && (
                <SopFormModal
                    sop={editingSop}
                    onClose={() => {
                        setShowAddModal(false)
                        setEditingSop(null)
                    }}
                    onSave={handleSaveSop}
                />
            )}
        </>
    )
}

// ---------------------------------------------------------------------------
// Sops Page (backward compatible wrapper)
// ---------------------------------------------------------------------------

export default function Sops() {
    return (
        <div className="page-container sidebar-top-page">
            <SopsTab />
        </div>
    )
}
