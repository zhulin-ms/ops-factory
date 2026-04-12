import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useSops } from '../hooks/useSops'
import { useCommandWhitelist } from '../hooks/useCommandWhitelist'
import { useToast } from '../../../platform/providers/ToastContext'
import { useUser } from '../../../platform/providers/UserContext'
import { GATEWAY_URL, gatewayHeaders } from '../../../../config/runtime'
import DetailDialog from '../../../platform/ui/primitives/DetailDialog'
import type { Sop, SopNode, SopCreateRequest } from '../../../../types/sop'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createEmptyNode(index: number): SopNode {
    return {
        id: `node-${Date.now()}-${index}`,
        name: '',
        type: 'start',
        tags: [],
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
        <div className="sop-workflow-inline-editor">
            <div className="sop-workflow-inline-editor-head">
                <p className="sop-workflow-inline-editor-title">
                    {t('remoteDiagnosis.sops.nodeVariables')}
                </p>
                <button
                    type="button"
                    className="btn btn-subtle sop-workflow-inline-add"
                    onClick={addVar}
                >
                    + {t('remoteDiagnosis.sops.addNode')}
                </button>
            </div>
            {variables.map((v, i: number) => (
                <div key={i} className="sop-workflow-inline-row">
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
                    <label className="sop-workflow-next-option">
                        <input
                            type="checkbox"
                            checked={v.required ?? false}
                            onChange={e => updateVar(i, 'required', e.target.checked)}
                        />
                        {t('remoteDiagnosis.sops.varRequired')}
                    </label>
                    <button
                        type="button"
                        className="knowledge-doc-action-btn knowledge-doc-action-icon danger sop-workflow-inline-remove"
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

    const toggleRequireHumanConfirm = useCallback(
        (index: number) => {
            const next = [...transitions]
            next[index] = { ...next[index], requireHumanConfirm: !next[index].requireHumanConfirm }
            onChange(next)
        },
        [transitions, onChange],
    )

    return (
        <div className="sop-workflow-inline-editor">
            <div className="sop-workflow-inline-editor-head">
                <p className="sop-workflow-inline-editor-title">
                    {t('remoteDiagnosis.sops.nodeTransitions')}
                </p>
                <button
                    type="button"
                    className="btn btn-subtle sop-workflow-inline-add"
                    onClick={addTransition}
                >
                    + {t('remoteDiagnosis.sops.addNode')}
                </button>
            </div>
            {transitions.map((tr, i) => (
                <div key={i} className="sop-workflow-transition-card">
                    <div className="sop-workflow-transition-head">
                        <input
                            className="form-input"
                            placeholder={t('remoteDiagnosis.sops.transitionCondition')}
                            value={tr.condition}
                            onChange={e => updateTransitionCondition(i, e.target.value)}
                        />
                        <button
                            type="button"
                            className="knowledge-doc-action-btn knowledge-doc-action-icon danger sop-workflow-inline-remove"
                            onClick={() => removeTransition(i)}
                            title={t('remoteDiagnosis.sops.removeNode')}
                        >
                            <TrashIcon />
                        </button>
                    </div>
                    <label className="sop-workflow-transition-confirm" title={t('remoteDiagnosis.sops.transitionConfirmHint')}>
                        <span
                            className={`sop-workflow-switch${tr.requireHumanConfirm ? ' is-on' : ''}`}
                            role="switch"
                            aria-checked={!!tr.requireHumanConfirm}
                            tabIndex={0}
                            onClick={() => toggleRequireHumanConfirm(i)}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRequireHumanConfirm(i) } }}
                        >
                            <span className="sop-workflow-switch-thumb" />
                        </span>
                        <span className="sop-workflow-transition-confirm-label">
                            {t('remoteDiagnosis.sops.transitionConfirm')}
                        </span>
                    </label>
                    {nodeNames.length > 0 && (
                        <div className="sop-workflow-next-nodes">
                            <span className="sop-workflow-next-label">
                                {t('remoteDiagnosis.sops.transitionNext')}:
                            </span>
                            {nodeNames.map(name => {
                                const checked = (tr.nextNodes ?? []).includes(name)
                                return (
                                    <label key={name} className="sop-workflow-next-option">
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
    const [mode, setMode] = useState<'structured' | 'natural_language'>(
        (sop?.mode as 'structured' | 'natural_language') ?? 'structured'
    )
    const [enabled, setEnabled] = useState(sop?.enabled ?? true)
    const [stepsDescription, setStepsDescription] = useState(sop?.stepsDescription ?? '')
    const [sopTags, setSopTags] = useState<string[]>(sop?.tags ?? [])

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

        // Validate node commands only for structured mode
        if (mode !== 'natural_language') {
            const errors: Record<number, string> = {}
            nodes.forEach((node, idx) => {
                if (node.type === 'browser' || node.type === 'end') return
                const rejected = validateNodeCommand(node.command || '')
                if (rejected.length > 0) {
                    errors[idx] = t('remoteDiagnosis.sops.commandNotInWhitelist', { commands: rejected.join(', ') })
                }
            })
            if (Object.keys(errors).length > 0) {
                setCommandErrors(errors)
                return
            }
        }

        setSaving(true)
        try {
            const payload: SopCreateRequest = {
                name: name.trim(),
                description: description.trim(),
                version: version.trim(),
                triggerCondition: triggerCondition.trim(),
                mode,
                enabled,
            }
            if (mode === 'natural_language') {
                payload.stepsDescription = stepsDescription.trim()
                payload.tags = sopTags
                payload.nodes = []
            } else {
                payload.nodes = nodes
            }
            await onSave(payload)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setSaving(false)
        }
    }, [name, description, version, triggerCondition, mode, enabled, stepsDescription, sopTags, nodes, onSave, t, validateNodeCommand])

    return (
        <DetailDialog
            title={sop ? t('remoteDiagnosis.sops.editSop') : t('remoteDiagnosis.sops.addSop')}
            onClose={onClose}
            variant="wide"
            className="sop-workflow-modal-wide"
            bodyClassName="sop-workflow-modal-body"
            footer={(
                <>
                    <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
                        {t('common.cancel')}
                    </button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
                        {saving ? t('common.saving') : t('common.save')}
                    </button>
                </>
            )}
        >
            {error && (
                <div className="agents-alert agents-alert-error">
                    {error}
                </div>
            )}

            <section className="knowledge-section-card sop-workflow-form-section">
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

                <div className="sop-workflow-modal-grid">
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

                <div className="sop-workflow-modal-grid">
                    <div className="form-group">
                        <label className="form-label">{t('remoteDiagnosis.sops.mode')}</label>
                        <select
                            className="form-input sop-workflow-mode-select"
                            value={mode}
                            onChange={e => setMode(e.target.value as 'structured' | 'natural_language')}
                        >
                            <option value="structured">{t('remoteDiagnosis.sops.modeStructured')}</option>
                            <option value="natural_language">{t('remoteDiagnosis.sops.modeNaturalLanguage')}</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">{t('remoteDiagnosis.sops.sopEnabled')}</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6 }}>
                            <span
                                className={`sop-workflow-switch${enabled ? ' is-on' : ''}`}
                                role="switch"
                                aria-checked={enabled}
                                tabIndex={0}
                                onClick={() => setEnabled(prev => !prev)}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEnabled(prev => !prev) } }}
                            >
                                <span className="sop-workflow-switch-thumb" />
                            </span>
                            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                                {enabled ? t('remoteDiagnosis.sops.sopEnabled') : t('remoteDiagnosis.sops.sopDisabled')}
                            </span>
                        </div>
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

            {mode === 'natural_language' ? (
                <section className="knowledge-section-card sop-workflow-node-editor">
                    <div className="sop-workflow-node-editor-head">
                        <div className="sop-workflow-node-editor-copy">
                            <h3 className="sop-workflow-node-editor-title">
                                {t('remoteDiagnosis.sops.stepsDescriptionTitle')}
                            </h3>
                            <p className="sop-workflow-node-editor-description">
                                {t('remoteDiagnosis.sops.stepsDescriptionHint')}
                            </p>
                        </div>
                    </div>
                    <div className="form-group sop-workflow-compact-field">
                        <label className="form-label">{t('remoteDiagnosis.sops.sopTags')}</label>
                        <input
                            className="form-input"
                            placeholder="tag1, tag2"
                            value={sopTags.join(', ')}
                            onChange={e => {
                                const tags = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                setSopTags(tags)
                            }}
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">{t('remoteDiagnosis.sops.stepsDescription')}</label>
                        <textarea
                            className="form-input sop-workflow-steps-textarea"
                            placeholder={t('remoteDiagnosis.sops.stepsDescriptionPlaceholder')}
                            value={stepsDescription}
                            onChange={e => setStepsDescription(e.target.value)}
                        />
                    </div>
                </section>
            ) : (
            <section className="knowledge-section-card sop-workflow-node-editor">
                <div className="sop-workflow-node-editor-head">
                    <div className="sop-workflow-node-editor-copy">
                        <h3 className="sop-workflow-node-editor-title">
                            {t('remoteDiagnosis.sops.nodeEditor')}
                        </h3>
                        <p className="sop-workflow-node-editor-description">
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
                    <div key={node.id} className="sop-workflow-node-surface">
                        <div className="sop-workflow-node-surface-head">
                            <span className="sop-workflow-node-index">
                                #{idx + 1}
                            </span>
                            {nodes.length > 1 && (
                                <button
                                    type="button"
                                    className="btn btn-quiet-danger sop-workflow-inline-danger"
                                    onClick={() => handleRemoveNode(idx)}
                                >
                                    {t('remoteDiagnosis.sops.removeNode')}
                                </button>
                            )}
                        </div>

                        <div className="sop-workflow-modal-grid">
                            <div className="form-group sop-workflow-compact-field">
                                <label className="form-label">{t('remoteDiagnosis.sops.nodeName')}</label>
                                <input
                                    className="form-input"
                                    value={node.name}
                                    onChange={e => handleNodeChange(idx, 'name', e.target.value)}
                                />
                            </div>
                            <div className="form-group sop-workflow-compact-field">
                                <label className="form-label">{t('remoteDiagnosis.sops.nodeType')}</label>
                                <select
                                    className="form-input"
                                    value={node.type}
                                    onChange={e => handleNodeChange(idx, 'type', e.target.value)}
                                >
                                    <option value="start">{t('remoteDiagnosis.sops.startNode')}</option>
                                    <option value="analysis">{t('remoteDiagnosis.sops.analysisNode')}</option>
                                    <option value="browser">{t('remoteDiagnosis.sops.browserNode')}</option>
                                    <option value="end">{t('remoteDiagnosis.sops.endNode')}</option>
                                </select>
                            </div>
                        </div>

                        {node.type === 'browser' ? (
                            <>
                                <div className="form-group sop-workflow-compact-field">
                                    <label className="form-label">{t('remoteDiagnosis.sops.browserUrl')}</label>
                                    <input
                                        className="form-input"
                                        placeholder="https://example.com"
                                        value={node.browserUrl ?? ''}
                                        onChange={e => handleNodeChange(idx, 'browserUrl', e.target.value)}
                                    />
                                </div>
                                <div className="form-group sop-workflow-compact-field">
                                    <label className="form-label">{t('remoteDiagnosis.sops.browserAction')}</label>
                                    <textarea
                                        className="form-input"
                                        rows={3}
                                        placeholder={t('remoteDiagnosis.sops.browserActionPlaceholder')}
                                        value={node.browserAction ?? ''}
                                        onChange={e => handleNodeChange(idx, 'browserAction', e.target.value)}
                                    />
                                </div>
                                <div className="form-group sop-workflow-compact-field">
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
                        ) : node.type === 'end' ? null : (
                            <>
                                <div className="form-group sop-workflow-compact-field">
                                    <label className="form-label">{t('remoteDiagnosis.sops.nodeTags')}</label>
                                    <input
                                        className="form-input"
                                        placeholder="tag1, tag2"
                                        value={node.tags?.join(', ') ?? ''}
                                        onChange={e => {
                                            const tags = e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                            handleNodeChange(idx, 'tags', tags)
                                        }}
                                    />
                                </div>

                                <div className="form-group sop-workflow-compact-field sop-workflow-command-field">
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

                        <div className="form-group sop-workflow-compact-field">
                            <label className="form-label">{t('remoteDiagnosis.sops.nodeOutputFormat')}</label>
                            <input
                                className="form-input"
                                value={node.outputFormat ?? ''}
                                onChange={e => handleNodeChange(idx, 'outputFormat', e.target.value)}
                            />
                        </div>

                        <div className="form-group sop-workflow-compact-field sop-workflow-analysis-field">
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
            )}
        </DetailDialog>
    )
}

// ---------------------------------------------------------------------------
// Expandable SOP Row
// ---------------------------------------------------------------------------

function SopExpandableRow({ sop, onEdit, onDelete, onToggleEnabled }: {
    sop: Sop
    onEdit: (sop: Sop) => void
    onDelete: (sop: Sop) => void
    onToggleEnabled: (sop: Sop, enabled: boolean) => void
}) {
    const { t } = useTranslation()
    const [expanded, setExpanded] = useState(false)
    const isNL = sop.mode === 'natural_language'

    return (
        <>
            <tr className="sop-workflow-table-row">
                <td>
                    <button
                        type="button"
                        className="sop-workflow-expand-button"
                        onClick={() => setExpanded(prev => !prev)}
                    >
                        <svg
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className={`sop-workflow-expand-icon${expanded ? ' expanded' : ''}`}
                        >
                            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                        </svg>
                        <span style={{ fontWeight: 700 }}>{sop.name}</span>
                    </button>
                </td>
                <td className="sop-workflow-muted-text">
                    {sop.description || '—'}
                </td>
                <td>
                    {sop.triggerCondition || '—'}
                </td>
                <td style={{ textAlign: 'center' }}>
                    <span className={`sop-workflow-node-type ${isNL ? 'sop-workflow-node-type-nl' : ''}`}>
                        {isNL ? 'NL' : (sop.nodes?.length ?? 0)}
                    </span>
                </td>
                <td style={{ textAlign: 'center' }}>
                    <div className="sop-workflow-enabled-cell">
                        <button
                            type="button"
                            className={`sop-workflow-switch${sop.enabled !== false ? ' is-on' : ''}`}
                            role="switch"
                            aria-checked={sop.enabled !== false}
                            onClick={() => onToggleEnabled(sop, sop.enabled === false)}
                        >
                            <span className="sop-workflow-switch-thumb" />
                        </button>
                    </div>
                </td>
                <td>
                    <div className="sop-workflow-table-actions">
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
                <tr className="sop-workflow-detail-row">
                    <td colSpan={6}>
                        <div className="sop-workflow-detail-panel">
                            {isNL ? (
                                <div>
                                    {sop.tags && sop.tags.length > 0 && (
                                        <div style={{ marginBottom: 'var(--spacing-3)' }}>
                                            <span className="sop-workflow-node-label">
                                                {t('remoteDiagnosis.sops.sopTags')}:
                                            </span>
                                            <div className="sop-workflow-host-tags" style={{ marginTop: 4 }}>
                                                {sop.tags.map(tag => (
                                                    <span key={tag} className="sop-workflow-meta-tag">{tag}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div>
                                        <span className="sop-workflow-node-label">
                                            {t('remoteDiagnosis.sops.stepsDescription')}:
                                        </span>
                                        <pre style={{ whiteSpace: 'pre-wrap', margin: 'var(--spacing-2) 0 0', fontSize: 'var(--font-size-sm)', lineHeight: 1.6, color: 'var(--color-text-primary)' }}>
                                            {sop.stepsDescription || '—'}
                                        </pre>
                                    </div>
                                </div>
                            ) : sop.nodes && sop.nodes.length > 0 ? (
                                <div className="sop-workflow-node-list">
                                    {sop.nodes.map((node, i) => (
                                        <div key={node.id || i} className="sop-workflow-node-card">
                                            <div className="sop-workflow-node-header">
                                                <p className="sop-workflow-node-name">
                                                    {node.name || `Node ${i + 1}`}
                                                </p>
                                                <span
                                                    className={`sop-workflow-node-type ${
                                                        node.type === 'start'
                                                            ? 'sop-workflow-node-type-start'
                                                            : node.type === 'browser'
                                                              ? 'sop-workflow-node-type-browser'
                                                              : node.type === 'end'
                                                                ? 'sop-workflow-node-type-end'
                                                                : 'sop-workflow-node-type-analysis'
                                                    }`}
                                                >
                                                    {node.type === 'start'
                                                        ? t('remoteDiagnosis.sops.startNode')
                                                        : node.type === 'browser'
                                                          ? t('remoteDiagnosis.sops.browserNode')
                                                          : node.type === 'end'
                                                            ? t('remoteDiagnosis.sops.endNode')
                                                            : t('remoteDiagnosis.sops.analysisNode')}
                                                </span>
                                            </div>
                                            <div className="sop-workflow-node-grid">
                                                {node.type === 'browser' ? (
                                                    <>
                                                        <div className="sop-workflow-node-item">
                                                            <span className="sop-workflow-node-label">
                                                                {t('remoteDiagnosis.sops.browserUrl')}
                                                            </span>
                                                            <code className="sop-workflow-code-pill">
                                                                {node.browserUrl || '—'}
                                                            </code>
                                                        </div>
                                                        {node.browserAction && (
                                                            <div className="sop-workflow-node-item" style={{ gridColumn: '1 / -1' }}>
                                                                <span className="sop-workflow-node-label">
                                                                    {t('remoteDiagnosis.sops.browserAction')}
                                                                </span>
                                                                <span className="sop-workflow-node-value">
                                                                    {node.browserAction}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </>
                                                ) : node.type === 'end' ? null : (
                                                    <>
                                                        {node.tags && node.tags.length > 0 && (
                                                            <div className="sop-workflow-node-item">
                                                                <span className="sop-workflow-node-label">
                                                                    {t('remoteDiagnosis.sops.nodeTags')}
                                                                </span>
                                                                <div className="sop-workflow-host-tags">
                                                                {node.tags.map(tag => (
                                                                    <span key={tag} className="sop-workflow-meta-tag">
                                                                        {tag}
                                                                    </span>
                                                                ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        <div className="sop-workflow-node-item">
                                                            <span className="sop-workflow-node-label">
                                                                {t('remoteDiagnosis.sops.nodeCommand')}
                                                            </span>
                                                            <code className="sop-workflow-code-pill">
                                                                {node.command || '—'}
                                                            </code>
                                                        </div>
                                                        {node.variables && node.variables.length > 0 && (
                                                            <div className="sop-workflow-node-item">
                                                                <span className="sop-workflow-node-label">
                                                                    {t('remoteDiagnosis.sops.nodeVariables')}
                                                                </span>
                                                                <span className="sop-workflow-node-value">
                                                                    {node.variables.map(v => v.name).join(', ')}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                                {node.transitions && node.transitions.length > 0 && (
                                                    <div className="sop-workflow-node-item" style={{ gridColumn: '1 / -1' }}>
                                                        <span className="sop-workflow-node-label">
                                                            {t('remoteDiagnosis.sops.nodeTransitions')}
                                                        </span>
                                                        <span className="sop-workflow-node-value">
                                                            {node.transitions
                                                                .map(tr => `${tr.condition} -> ${(tr.nextNodes ?? []).join(', ') || tr.nextNodeId || '—'}${tr.requireHumanConfirm ? ' [' + t('remoteDiagnosis.sops.transitionConfirm') + ']' : ''}`)
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
    const { userId } = useUser()

    const PAGE_SIZE = 10
    const [currentPage, setCurrentPage] = useState(1)
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

    const handleToggleEnabled = useCallback(
        async (sop: Sop, enabled: boolean) => {
            try {
                const res = await fetch(`${GATEWAY_URL}/sops/${sop.id}`, {
                    method: 'PUT',
                    headers: gatewayHeaders(userId),
                    body: JSON.stringify({ enabled }),
                    signal: AbortSignal.timeout(10000),
                })
                if (!res.ok) {
                    const text = await res.text()
                    let msg = text
                    try { msg = JSON.parse(text).error || text } catch { /* use raw */ }
                    throw new Error(msg)
                }
                showToast('success', t('remoteDiagnosis.sops.toggleSuccess', {
                    name: sop.name,
                    status: enabled ? t('remoteDiagnosis.sops.sopEnabled') : t('remoteDiagnosis.sops.sopDisabled'),
                }))
                await fetchSops()
            } catch (err) {
                showToast('error', err instanceof Error ? err.message : 'Update failed')
            }
        },
        [userId, fetchSops, showToast, t],
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
            <section className="knowledge-section-card sop-workflow-section-card">
                <div className="knowledge-section-header sop-workflow-section-header">
                    <div>
                        <h2 className="knowledge-section-title">{t('remoteDiagnosis.sops.title')}</h2>
                        <p className="knowledge-section-description">
                            {t('remoteDiagnosis.sops.subtitle')}
                        </p>
                    </div>
                    <div className="knowledge-doc-toolbar-actions sop-workflow-toolbar-actions">
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
                    <div className="sop-workflow-empty-shell">
                        <div className="empty-state">
                            <h3 className="empty-state-title">{t('common.loading')}</h3>
                        </div>
                    </div>
                ) : sops.length === 0 ? (
                    <div className="sop-workflow-empty-shell">
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
                    (() => {
                        const totalPages = Math.max(1, Math.ceil(sops.length / PAGE_SIZE))
                        const safePage = Math.min(currentPage, totalPages)
                        const paginatedSops = sops.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
                        return <>
                    <div className="sop-workflow-list-shell">
                        <div className="sop-workflow-table-wrap">
                            <table className="sop-workflow-table">
                                <thead>
                                    <tr>
                                        <th>{t('remoteDiagnosis.sops.name')}</th>
                                        <th>{t('remoteDiagnosis.sops.description')}</th>
                                        <th>{t('remoteDiagnosis.sops.triggerCondition')}</th>
                                        <th style={{ textAlign: 'center' }}>
                                            {t('remoteDiagnosis.sops.mode')}
                                        </th>
                                        <th style={{ textAlign: 'center' }}>
                                            {t('remoteDiagnosis.sops.status')}
                                        </th>
                                        <th style={{ textAlign: 'right' }}>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedSops.map(sop => (
                                        <SopExpandableRow
                                            key={sop.id}
                                            sop={sop}
                                            onEdit={s => {
                                                setEditingSop(s)
                                                setShowAddModal(true)
                                            }}
                                            onDelete={handleDelete}
                                            onToggleEnabled={handleToggleEnabled}
                                        />
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
                                    end: Math.min(safePage * PAGE_SIZE, sops.length),
                                    total: sops.length,
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
