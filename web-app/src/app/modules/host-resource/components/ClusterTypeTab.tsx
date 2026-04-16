import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import TypeCard from './TypeCard'
import type { ClusterType } from '../../../../types/host'

type Props = {
    clusterTypes: ClusterType[]
    loading: boolean
    onCreate: (body: Partial<ClusterType>) => Promise<ClusterType>
    onUpdate: (id: string, body: Partial<ClusterType>) => Promise<ClusterType>
    onDelete: (id: string) => Promise<boolean>
}

type FormData = {
    name: string
    code: string
    description: string
    color: string
    knowledge: string
}

const emptyForm: FormData = { name: '', code: '', description: '', color: '#10b981', knowledge: '' }

export default function ClusterTypeTab({ clusterTypes, loading, onCreate, onUpdate, onDelete }: Props) {
    const { t } = useTranslation()
    const [showModal, setShowModal] = useState(false)
    const [editing, setEditing] = useState<ClusterType | null>(null)
    const [form, setForm] = useState<FormData>(emptyForm)
    const [saving, setSaving] = useState(false)

    const openCreate = useCallback(() => {
        setEditing(null)
        setForm(emptyForm)
        setShowModal(true)
    }, [])

    const openEdit = useCallback((item: ClusterType) => {
        setEditing(item)
        setForm({
            name: item.name,
            code: item.code,
            description: item.description,
            color: item.color,
            knowledge: item.knowledge,
        })
        setShowModal(true)
    }, [])

    const handleSave = useCallback(async () => {
        if (!form.name.trim()) return
        setSaving(true)
        try {
            if (editing) {
                await onUpdate(editing.id, form)
            } else {
                await onCreate(form)
            }
            setShowModal(false)
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed')
        } finally {
            setSaving(false)
        }
    }, [editing, form, onCreate, onUpdate])

    const handleDelete = useCallback(async (item: ClusterType) => {
        if (confirm(t('hostResource.confirmDeleteClusterType'))) {
            try {
                await onDelete(item.id)
            } catch (err) {
                alert(err instanceof Error ? err.message : 'Failed')
            }
        }
    }, [onDelete, t])

    return (
        <div className="hr-type-tab-content">
            <div className="hr-type-tab-header">
                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary, #64748b)' }}>
                    {t('hostResource.tabClusterTypes')} ({clusterTypes.length})
                </span>
                <button className="btn btn-primary btn-sm" onClick={openCreate}>
                    + {t('hostResource.createClusterType')}
                </button>
            </div>

            {loading ? (
                <div className="hr-empty">{t('common.loading')}</div>
            ) : clusterTypes.length === 0 ? (
                <div className="hr-type-tab-empty">
                    <div className="hr-type-tab-empty-text">{t('hostResource.noClusterTypes')}</div>
                </div>
            ) : (
                <div className="hr-type-def-grid">
                    {clusterTypes.map(ct => (
                        <TypeCard
                            key={ct.id}
                            item={ct}
                            onEdit={openEdit}
                            onDelete={handleDelete}
                        />
                    ))}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="hr-host-modal modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editing ? t('hostResource.editClusterType') : t('hostResource.createClusterType')}</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label className="form-label">{t('hostResource.typeName')}</label>
                                <input
                                    className="form-input"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder={t('hostResource.typeName')}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">{t('hostResource.typeCode')}</label>
                                <input
                                    className="form-input"
                                    value={form.code}
                                    onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                                    placeholder={t('hostResource.typeCode')}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">{t('hostResource.description')}</label>
                                <input
                                    className="form-input"
                                    value={form.description}
                                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">{t('hostResource.typeColor')}</label>
                                <input
                                    type="color"
                                    value={form.color}
                                    onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                                    style={{ width: 48, height: 32, padding: 2, cursor: 'pointer' }}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">{t('hostResource.knowledge')}</label>
                                <textarea
                                    className="form-input"
                                    rows={5}
                                    value={form.knowledge}
                                    onChange={e => setForm(f => ({ ...f, knowledge: e.target.value }))}
                                    placeholder={t('hostResource.knowledgeHint')}
                                    style={{ resize: 'vertical' }}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>
                                {t('common.cancel')}
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSave}
                                disabled={saving || !form.name.trim()}
                            >
                                {saving ? t('common.saving') : t('common.save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
