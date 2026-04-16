import { useState, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { HostGroup, Cluster, Host, HostRelation, CustomAttribute, HostCreateRequest, DiscoveryCommand, DiscoveryPlan, HostDiscoveryResult, BusinessService, ClusterType, BusinessType } from '../../../../types/host'
import { isValidIp } from '../../../../utils/ip-validation'
import CustomAttributeEditor from './CustomAttributeEditor'

type ResourceType = 'group' | 'cluster' | 'business-service' | 'host' | 'relation'

type EditingItem =
    | { type: 'group'; data: HostGroup }
    | { type: 'cluster'; data: Cluster }
    | { type: 'business-service'; data: BusinessService }
    | { type: 'host'; data: Host }
    | null

type Props = {
    editingItem: EditingItem
    groups: HostGroup[]
    clusters: Cluster[]
    hosts: Host[]
    defaultGroupId?: string
    defaultClusterId?: string
    hostRelations: HostRelation[]
    fetchHostRelations: (groupId: string | undefined, hostId?: string, sourceType?: string, sourceId?: string) => Promise<void>
    clusterTypes: ClusterType[]
    businessTypes: BusinessType[]
    businessServices: BusinessService[]
    onClose: () => void
    onSaveGroup: (data: Partial<HostGroup>) => Promise<void>
    onSaveCluster: (data: Partial<Cluster>) => Promise<void>
    onSaveBusinessService: (data: Partial<BusinessService>) => Promise<void>
    onSaveHost: (data: HostCreateRequest | Partial<Host>) => Promise<void>
    onSaveRelation: (data: Partial<HostRelation>) => Promise<void>
    onUpdateRelation: (id: string, data: Partial<HostRelation>) => Promise<void>
    onDeleteRelation: (id: string) => Promise<unknown>
    discoverPlan?: (id: string) => Promise<DiscoveryPlan>
    discoverExecute?: (id: string, commands: DiscoveryCommand[]) => Promise<HostDiscoveryResult>
}

export default function ResourceFormModal({
    editingItem,
    groups, clusters, hosts,
    defaultGroupId, defaultClusterId,
    hostRelations, fetchHostRelations,
    clusterTypes, businessTypes, businessServices,
    onClose,
    onSaveGroup, onSaveCluster, onSaveBusinessService, onSaveHost, onSaveRelation, onUpdateRelation, onDeleteRelation,
    discoverPlan, discoverExecute,
}: Props) {
    const { t } = useTranslation()
    const [selectedType, setSelectedType] = useState<ResourceType | null>(
        editingItem?.type ?? null
    )
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // ── Group form state ──
    const [groupName, setGroupName] = useState(editingItem?.type === 'group' ? editingItem.data.name : '')
    const [groupParentId, setGroupParentId] = useState(editingItem?.type === 'group' ? (editingItem.data.parentId ?? '') : '')
    const [groupDescription, setGroupDescription] = useState(editingItem?.type === 'group' ? editingItem.data.description : '')
    const [groupCode, setGroupCode] = useState(editingItem?.type === 'group' ? (editingItem.data.code ?? '') : '')

    // ── Cluster form state ──
    const [clusterName, setClusterName] = useState(editingItem?.type === 'cluster' ? editingItem.data.name : '')
    const [clusterType, setClusterType] = useState(editingItem?.type === 'cluster' ? editingItem.data.type : '')
    const [clusterTypeIsCustom, setClusterTypeIsCustom] = useState(false)
    const [clusterPurpose, setClusterPurpose] = useState(editingItem?.type === 'cluster' ? editingItem.data.purpose : '')
    const [clusterGroupId, setClusterGroupId] = useState(editingItem?.type === 'cluster' ? (editingItem.data.groupId ?? '') : (defaultGroupId ?? ''))
    const [clusterDescription, setClusterDescription] = useState(editingItem?.type === 'cluster' ? editingItem.data.description : '')

    // ── Business service form state ──
    const [bsName, setBsName] = useState(editingItem?.type === 'business-service' ? editingItem.data.name : '')
    const [bsCode, setBsCode] = useState(editingItem?.type === 'business-service' ? editingItem.data.code : '')
    const [bsGroupId, setBsGroupId] = useState(editingItem?.type === 'business-service' ? (editingItem.data.groupId ?? '') : (defaultGroupId ?? ''))
    const [bsSelectedBusinessTypeId, setBsSelectedBusinessTypeId] = useState<string>(
        editingItem?.type === 'business-service' ? (editingItem.data.businessTypeId ?? '') : ''
    )
    const [bsTags, setBsTags] = useState(editingItem?.type === 'business-service' ? (editingItem.data.tags ?? []).join(', ') : '')
    const [bsPriority, setBsPriority] = useState(editingItem?.type === 'business-service' ? editingItem.data.priority : '')
    const [bsDescription, setBsDescription] = useState(editingItem?.type === 'business-service' ? editingItem.data.description : '')

    // ── Host form state ──
    const [hostName, setHostName] = useState(editingItem?.type === 'host' ? editingItem.data.name : '')
    const [hostname, setHostname] = useState(editingItem?.type === 'host' ? (editingItem.data.hostname ?? '') : '')
    const [hostIp, setHostIp] = useState(editingItem?.type === 'host' ? editingItem.data.ip : '')
    const [hostPort, setHostPort] = useState(editingItem?.type === 'host' ? editingItem.data.port : 22)
    const [hostOs, setHostOs] = useState(editingItem?.type === 'host' ? (editingItem.data.os ?? '') : '')
    const [hostLocation, setHostLocation] = useState(editingItem?.type === 'host' ? (editingItem.data.location ?? '') : '')
    const [hostUsername, setHostUsername] = useState(editingItem?.type === 'host' ? editingItem.data.username : '')
    const [hostAuthType, setHostAuthType] = useState<'password' | 'key'>(editingItem?.type === 'host' ? editingItem.data.authType : 'password')
    const [hostCredential, setHostCredential] = useState(editingItem?.type === 'host' ? '***' : '')
    const [hostClusterId, setHostClusterId] = useState(editingItem?.type === 'host' ? (editingItem.data.clusterId ?? '') : (defaultClusterId ?? ''))
    const [hostPurpose, setHostPurpose] = useState(editingItem?.type === 'host' ? (editingItem.data.purpose ?? '') : '')
    const [hostBusiness, setHostBusiness] = useState(editingItem?.type === 'host' ? (editingItem.data.business ?? '') : '')
    const [hostDescription, setHostDescription] = useState(editingItem?.type === 'host' ? editingItem.data.description : '')
    const [hostCustomAttributes, setHostCustomAttributes] = useState<CustomAttribute[]>(
        editingItem?.type === 'host' ? (editingItem.data.customAttributes ?? []) : []
    )

    // ── Relation form state ──
    const [sourceHostId, setSourceHostId] = useState('')
    const [targetHostId, setTargetHostId] = useState('')
    const [relationDescription, setRelationDescription] = useState('')
    const [sourceType, setSourceType] = useState<'host' | 'business-service'>('host')

    // ── BS edit topology area: new relation ──
    const [bsNewRelTargetId, setBsNewRelTargetId] = useState('')
    const [bsNewRelDesc, setBsNewRelDesc] = useState('')

    // ── Host-edit relation section ──
    const [newRelTargetId, setNewRelTargetId] = useState('')
    const [newRelDesc, setNewRelDesc] = useState('')
    const [editingRelId, setEditingRelId] = useState<string | null>(null)
    const [editRelTargetId, setEditRelTargetId] = useState('')
    const [editRelDesc, setEditRelDesc] = useState('')

    // ── Auto Discovery state ──
    const [discoveryPhase, setDiscoveryPhase] = useState<'idle' | 'planning' | 'confirming' | 'executing' | 'results'>('idle')
    const [discoveryCommands, setDiscoveryCommands] = useState<DiscoveryCommand[]>([])
    const [selectedCommands, setSelectedCommands] = useState<Set<string>>(new Set())
    const [discoveryResult, setDiscoveryResult] = useState<HostDiscoveryResult | null>(null)
    const [selectedAttributes, setSelectedAttributes] = useState<Set<string>>(new Set())

    // Fetch relations for the host being edited
    useEffect(() => {
        if (editingItem?.type === 'host') {
            fetchHostRelations(undefined, editingItem.data.id)
            setNewRelTargetId('')
            setNewRelDesc('')
            setEditingRelId(null)
        }
    }, [editingItem, fetchHostRelations])

    // Fetch relations for the business service being edited
    useEffect(() => {
        if (editingItem?.type === 'business-service') {
            fetchHostRelations(undefined, undefined, 'business-service', editingItem.data.id)
            setBsNewRelTargetId('')
            setBsNewRelDesc('')
        }
    }, [editingItem, fetchHostRelations])

    // Collect self + all descendant IDs when editing a group (to prevent circular refs)
    const getDescendantIds = useCallback((groupId: string): Set<string> => {
        const ids = new Set<string>()
        const queue = [groupId]
        while (queue.length > 0) {
            const current = queue.shift()!
            ids.add(current)
            for (const g of groups) {
                if (g.parentId === current && !ids.has(g.id)) {
                    queue.push(g.id)
                }
            }
        }
        return ids
    }, [groups])

    const parentCandidates = useMemo(() => {
        const excludeIds = editingItem?.type === 'group' ? getDescendantIds(editingItem.data.id) : new Set<string>()
        // Allow 1st-level (no parentId) and 2nd-level (parentId points to a root group)
        return groups.filter(g => {
            if (excludeIds.has(g.id)) return false
            if (!g.parentId) return true // 1st-level group
            // 2nd-level: parentId points to a root group
            const parent = groups.find(pg => pg.id === g.parentId)
            return parent ? !parent.parentId : false
        })
    }, [groups, editingItem, getDescendantIds])

    const getHostName = (hostId: string) => {
        const h = hosts.find(h => h.id === hostId)
        return h ? `${h.name} (${h.ip})` : hostId.substring(0, 8)
    }

    const handleStartDiscovery = useCallback(async () => {
        if (!editingItem || editingItem.type !== 'host' || !discoverPlan) return
        setDiscoveryPhase('planning')
        setError(null)
        try {
            const plan = await discoverPlan(editingItem.data.id)
            if (plan.success && plan.commands.length > 0) {
                setDiscoveryCommands(plan.commands)
                setSelectedCommands(new Set(plan.commands.map(c => c.label)))
                setDiscoveryPhase('confirming')
            } else {
                setError(plan.error || t('hostResource.discoveryPlanFailed', { defaultValue: 'Failed to generate discovery commands' }))
                setDiscoveryPhase('idle')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Discovery failed')
            setDiscoveryPhase('idle')
        }
    }, [editingItem, discoverPlan, t])

    const handleRunSelected = useCallback(async () => {
        if (!editingItem || editingItem.type !== 'host' || !discoverExecute) return
        const cmds = discoveryCommands.filter(c => selectedCommands.has(c.label))
        if (cmds.length === 0) return
        setDiscoveryPhase('executing')
        setError(null)
        try {
            const result = await discoverExecute(editingItem.data.id, cmds)
            if (result.success) {
                setDiscoveryResult(result)
                // Pre-select all attributes
                const keys = new Set<string>()
                if (result.formMappings?.hostname) keys.add('hostname')
                if (result.formMappings?.os) keys.add('os')
                result.customAttributes?.forEach(a => keys.add(a.key))
                setSelectedAttributes(keys)
                setDiscoveryPhase('results')
            } else {
                setError(result.error || t('hostResource.discoveryExecFailed', { defaultValue: 'Discovery execution failed' }))
                setDiscoveryPhase('confirming')
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Execution failed')
            setDiscoveryPhase('confirming')
        }
    }, [editingItem, discoverExecute, discoveryCommands, selectedCommands, t])

    const handleApplyDiscovery = useCallback(() => {
        if (!discoveryResult) return
        if (selectedAttributes.has('hostname') && discoveryResult.formMappings?.hostname) {
            setHostname(discoveryResult.formMappings.hostname)
        }
        if (selectedAttributes.has('os') && discoveryResult.formMappings?.os) {
            setHostOs(discoveryResult.formMappings.os)
        }
        const newAttrs = discoveryResult.customAttributes?.filter(a => selectedAttributes.has(a.key)) ?? []
        if (newAttrs.length > 0) {
            const merged = [...hostCustomAttributes]
            for (const attr of newAttrs) {
                const idx = merged.findIndex(a => a.key === attr.key)
                if (idx >= 0) {
                    merged[idx] = attr
                } else {
                    merged.push(attr)
                }
            }
            setHostCustomAttributes(merged)
        }
        setDiscoveryPhase('idle')
        setDiscoveryResult(null)
    }, [discoveryResult, selectedAttributes, hostCustomAttributes])

    const handleAddRelation = useCallback(async () => {
        if (!editingItem) return
        if (editingItem.type === 'host') {
            if (!newRelTargetId) return
            setError(null)
            try {
                await onSaveRelation({
                    sourceHostId: editingItem.data.id,
                    targetHostId: newRelTargetId,
                    description: newRelDesc.trim(),
                })
                setNewRelTargetId('')
                setNewRelDesc('')
                await fetchHostRelations(undefined, editingItem.data.id)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed')
            }
        } else if (editingItem.type === 'business-service') {
            if (!bsNewRelTargetId) return
            setError(null)
            try {
                await onSaveRelation({
                    sourceHostId: editingItem.data.id,
                    targetHostId: bsNewRelTargetId,
                    description: bsNewRelDesc.trim(),
                    sourceType: 'business-service',
                })
                setBsNewRelTargetId('')
                setBsNewRelDesc('')
                await fetchHostRelations(undefined, undefined, 'business-service', editingItem.data.id)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed')
            }
        }
    }, [editingItem, newRelTargetId, newRelDesc, bsNewRelTargetId, bsNewRelDesc, onSaveRelation, fetchHostRelations])

    const handleDeleteRelation = useCallback(async (relId: string) => {
        if (!editingItem) return
        setError(null)
        try {
            await onDeleteRelation(relId)
            if (editingItem.type === 'host') {
                await fetchHostRelations(undefined, editingItem.data.id)
            } else if (editingItem.type === 'business-service') {
                await fetchHostRelations(undefined, undefined, 'business-service', editingItem.data.id)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed')
        }
    }, [editingItem, onDeleteRelation, fetchHostRelations])

    const handleSaveRelationEdit = useCallback(async () => {
        if (!editingRelId) return
        setError(null)
        try {
            await onUpdateRelation(editingRelId, {
                targetHostId: editRelTargetId,
                description: editRelDesc.trim(),
            })
            setEditingRelId(null)
            if (editingItem?.type === 'host') {
                await fetchHostRelations(undefined, editingItem.data.id)
            } else if (editingItem?.type === 'business-service') {
                await fetchHostRelations(undefined, undefined, 'business-service', editingItem.data.id)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed')
        }
    }, [editingRelId, editRelTargetId, editRelDesc, onUpdateRelation, editingItem, fetchHostRelations])

    const getModalTitle = () => {
        if (editingItem) {
            const prefix = t('hostResource.edit', { defaultValue: 'Edit' })
            const typeLabels: Record<string, string> = {
                group: t('hostResource.createGroup'),
                cluster: t('hostResource.createCluster'),
                'business-service': t('hostResource.createBusinessService'),
                host: t('hostResource.createHost'),
            }
            return `${prefix}${typeLabels[editingItem.type] ?? ''}`
        }
        if (!selectedType) return t('hostResource.createResource')
        const typeLabels: Record<string, string> = {
            group: t('hostResource.createGroup'),
            cluster: t('hostResource.createCluster'),
            'business-service': t('hostResource.createBusinessService'),
            host: t('hostResource.createHost'),
            relation: t('hostResource.createRelation'),
        }
        return `${t('hostResource.create', { defaultValue: 'Create' })}${typeLabels[selectedType] ?? ''}`
    }

    const handleSave = useCallback(async () => {
        setError(null)
        setSaving(true)
        try {
            if (selectedType === 'group') {
                if (!groupName.trim()) { setError(t('hostResource.nameRequired')); setSaving(false); return }
                await onSaveGroup({ name: groupName.trim(), code: groupCode.trim(), parentId: groupParentId || null, description: groupDescription.trim() })
            } else if (selectedType === 'cluster') {
                if (!clusterName.trim()) { setError(t('hostResource.nameRequired')); setSaving(false); return }
                await onSaveCluster({
                    name: clusterName.trim(), type: clusterType.trim(), purpose: clusterPurpose.trim(),
                    groupId: clusterGroupId || null, description: clusterDescription.trim(),
                })
            } else if (selectedType === 'business-service') {
                if (!bsName.trim()) { setError(t('hostResource.nameRequired')); setSaving(false); return }
                // Derive hostIds from current BS relations when editing
                const currentHostIds = editingItem?.type === 'business-service'
                    ? hostRelations
                        .filter(r => (r.sourceType || 'host') === 'business-service')
                        .map(r => r.targetHostId)
                    : []
                await onSaveBusinessService({
                    name: bsName.trim(),
                    code: bsCode.trim(),
                    groupId: bsGroupId || null,
                    businessTypeId: bsSelectedBusinessTypeId || null,
                    hostIds: currentHostIds,
                    tags: bsTags.split(',').map(s => s.trim()).filter(Boolean),
                    priority: bsPriority.trim(),
                    description: bsDescription.trim(),
                    contactInfo: '',
                })
            } else if (selectedType === 'host') {
                if (!hostName.trim() || !hostIp.trim()) { setError(t('hostResource.nameAndIpRequired')); setSaving(false); return }
                if (!isValidIp(hostIp)) { setError(t('hostResource.ipInvalid')); setSaving(false); return }
                const payload: Record<string, unknown> = {
                    name: hostName.trim(), hostname: hostname.trim() || null, ip: hostIp.trim(), port: hostPort,
                    os: hostOs.trim() || null, location: hostLocation.trim() || null, username: hostUsername.trim(),
                    authType: hostAuthType, clusterId: hostClusterId || null, purpose: hostPurpose.trim() || null,
                    business: hostBusiness.trim() || null, description: hostDescription.trim(), customAttributes: hostCustomAttributes,
                }
                if (hostCredential && hostCredential !== '***') payload.credential = hostCredential
                await onSaveHost(payload as unknown as HostCreateRequest)
            } else if (selectedType === 'relation') {
                if (!sourceHostId || !targetHostId) { setError(t('hostResource.selectBothHosts')); setSaving(false); return }
                if (sourceHostId === targetHostId && sourceType === 'host') { setError(t('hostResource.sameHostError')); setSaving(false); return }
                await onSaveRelation({ sourceHostId, targetHostId, description: relationDescription.trim(), sourceType })
            }
            onClose()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error')
        } finally {
            setSaving(false)
        }
    }, [selectedType, groupName, groupParentId, groupDescription, groupCode, clusterName, clusterType, clusterPurpose,
        clusterGroupId, clusterDescription, hostName, hostname, hostIp, hostPort, hostOs, hostLocation,
        hostUsername, hostAuthType, hostCredential, hostClusterId, hostPurpose, hostBusiness,
        hostDescription, hostCustomAttributes, sourceHostId, targetHostId, relationDescription, sourceType,
        bsName, bsCode, bsGroupId, bsSelectedBusinessTypeId, bsTags, bsPriority, bsDescription,
        hostRelations,
        onSaveGroup, onSaveCluster, onSaveBusinessService, onSaveHost, onSaveRelation, onClose, t, editingItem])

    const canSave = () => {
        if (selectedType === 'group') return groupName.trim().length > 0
        if (selectedType === 'cluster') return clusterName.trim().length > 0
        if (selectedType === 'business-service') return bsName.trim().length > 0
        if (selectedType === 'host') return hostName.trim().length > 0 && hostIp.trim().length > 0
        if (selectedType === 'relation') return !!sourceHostId && !!targetHostId
        return false
    }

    const typeCards: { type: ResourceType; icon: string; color: string; labelKey: string }[] = [
        { type: 'group', icon: '📁', color: 'var(--color-warning, #f59e0b)', labelKey: 'hostResource.createGroup' },
        { type: 'cluster', icon: '🖥️', color: 'var(--color-success, #10b981)', labelKey: 'hostResource.createCluster' },
        { type: 'business-service', icon: '🏢', color: '#6366f1', labelKey: 'hostResource.createBusinessService' },
        { type: 'host', icon: '💻', color: 'var(--color-primary, #3b82f6)', labelKey: 'hostResource.createHost' },
        { type: 'relation', icon: '🔗', color: 'var(--color-secondary, #8b5cf6)', labelKey: 'hostResource.createRelation' },
    ]

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: selectedType === 'host' ? 640 : 520 }}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {!editingItem && selectedType && (
                            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedType(null)} style={{ padding: '2px 8px' }}>
                                ←
                            </button>
                        )}
                        <h2 className="modal-title">{getModalTitle()}</h2>
                    </div>
                    <button className="modal-close" onClick={onClose}>&times;</button>
                </div>

                {!selectedType ? (
                    <div className="modal-body">
                        <div className="hr-type-selector">
                            {typeCards.map(card => (
                                <div
                                    key={card.type}
                                    className="hr-type-card"
                                    onClick={() => setSelectedType(card.type)}
                                >
                                    <span className="hr-type-card-icon" style={{ background: card.color }}>{card.icon}</span>
                                    <span className="hr-type-card-label">{t(card.labelKey)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="modal-body hr-host-modal">
                            {error && (
                                <div className="agents-alert agents-alert-error" style={{ marginBottom: 'var(--spacing-4)' }}>
                                    {error}
                                </div>
                            )}

                            {selectedType === 'group' && (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">{t('hostResource.groupName')}</label>
                                        <input className="form-input" value={groupName} onChange={e => setGroupName(e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('hostResource.groupCode')}</label>
                                        <input className="form-input" value={groupCode} onChange={e => setGroupCode(e.target.value)} placeholder={t('hostResource.groupCodePlaceholder', { defaultValue: '' })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('hostResource.parentGroup')}</label>
                                        <select className="form-input" value={groupParentId} onChange={e => setGroupParentId(e.target.value)}>
                                            <option value="">{t('hostResource.noParent')}</option>
                                            {parentCandidates.map(g => (
                                                <option key={g.id} value={g.id}>{g.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('hostResource.description')}</label>
                                        <input className="form-input" value={groupDescription} onChange={e => setGroupDescription(e.target.value)} />
                                    </div>
                                </>
                            )}

                            {selectedType === 'cluster' && (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">{t('hostResource.clusterName')}</label>
                                        <input className="form-input" value={clusterName} onChange={e => setClusterName(e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('hostResource.clusterType')}</label>
                                        <select
                                            className="form-input"
                                            value={clusterTypeIsCustom ? '__custom__' : clusterType}
                                            onChange={e => {
                                                if (e.target.value === '__custom__') {
                                                    setClusterTypeIsCustom(true)
                                                    setClusterType('')
                                                } else {
                                                    setClusterTypeIsCustom(false)
                                                    setClusterType(e.target.value)
                                                }
                                            }}
                                        >
                                            <option value="">{t('hostResource.selectClusterType')}</option>
                                            {clusterTypes.map(ct => (
                                                <option key={ct.id} value={ct.name}>{ct.name}</option>
                                            ))}
                                            <option value="__custom__">{t('hostResource.customType')}</option>
                                        </select>
                                        {clusterTypeIsCustom && (
                                            <input
                                                className="form-input"
                                                style={{ marginTop: 4 }}
                                                value={clusterType}
                                                onChange={e => setClusterType(e.target.value)}
                                                placeholder="NSLB, RCPA, KAFKA..."
                                            />
                                        )}
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('hostResource.purpose')}</label>
                                        <input className="form-input" value={clusterPurpose} onChange={e => setClusterPurpose(e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('hostResource.parentGroup')}</label>
                                        <select className="form-input" value={clusterGroupId} onChange={e => setClusterGroupId(e.target.value)}>
                                            <option value="">{t('hostResource.noParent')}</option>
                                            {groups.map(g => (
                                                <option key={g.id} value={g.id}>{g.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('hostResource.description')}</label>
                                        <input className="form-input" value={clusterDescription} onChange={e => setClusterDescription(e.target.value)} />
                                    </div>
                                </>
                            )}

                            {selectedType === 'business-service' && (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">{t('hostResource.selectBusinessType')}</label>
                                        {businessTypes.length > 0 ? (
                                            <select
                                                className="form-input"
                                                value={bsSelectedBusinessTypeId}
                                                onChange={e => {
                                                    const btId = e.target.value
                                                    setBsSelectedBusinessTypeId(btId)
                                                    if (btId) {
                                                        const bt = businessTypes.find(b => b.id === btId)
                                                        if (bt) {
                                                            setBsCode(bt.code)
                                                            if (!editingItem) {
                                                                setBsName(bt.name)
                                                                setBsDescription(bt.description)
                                                            }
                                                        }
                                                    } else {
                                                        setBsCode('')
                                                    }
                                                }}
                                            >
                                                <option value="">{t('hostResource.selectBusinessType')}</option>
                                                {businessTypes.map(bt => (
                                                    <option key={bt.id} value={bt.id}>{bt.name}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>
                                                {t('hostResource.noBusinessTypes')}
                                            </div>
                                        )}
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('hostResource.bsName')}</label>
                                        <input className="form-input" value={bsName} onChange={e => setBsName(e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('hostResource.bsPriority')}</label>
                                        <select className="form-input" value={bsPriority} onChange={e => setBsPriority(e.target.value)}>
                                            <option value="">--</option>
                                            <option value="P0">P0</option>
                                            <option value="P1">P1</option>
                                            <option value="P2">P2</option>
                                            <option value="P3">P3</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('hostResource.bsGroup')}</label>
                                        <select className="form-input" value={bsGroupId} onChange={e => setBsGroupId(e.target.value)}>
                                            <option value="">{t('hostResource.noParent')}</option>
                                            {groups.map(g => (
                                                <option key={g.id} value={g.id}>{g.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {/* ── Topology Relations (edit mode only) ── */}
                                    {editingItem?.type === 'business-service' && (
                                        <>
                                            <h4 className="hr-section-label">{t('hostResource.topology')}</h4>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                {hostRelations.filter(r => (r.sourceType || 'host') === 'business-service').length === 0 && (
                                                    <div style={{ color: 'var(--text-secondary, #64748b)', fontSize: '0.8125rem' }}>
                                                        {t('hostResource.noSourceRelations')}
                                                    </div>
                                                )}
                                                {hostRelations.filter(r => (r.sourceType || 'host') === 'business-service').map(rel => (
                                                    <div key={rel.id} style={{
                                                        display: 'flex', alignItems: 'center', gap: 6,
                                                        padding: '4px 8px', border: '1px solid var(--border-color, #e2e8f0)',
                                                        borderRadius: 4, fontSize: '0.8125rem',
                                                    }}>
                                                        {editingRelId === rel.id ? (
                                                            <>
                                                                <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>→</span>
                                                                <select className="form-input" style={{ flex: 1, fontSize: '0.75rem', padding: '2px 4px' }}
                                                                    value={editRelTargetId} onChange={e => setEditRelTargetId(e.target.value)}>
                                                                    {hosts.filter(h => h.id !== editingItem?.data?.id).map(h => (
                                                                        <option key={h.id} value={h.id}>{h.name} ({h.ip})</option>
                                                                    ))}
                                                                </select>
                                                                <input className="form-input" style={{ flex: 1, fontSize: '0.75rem', padding: '2px 4px' }}
                                                                    value={editRelDesc} onChange={e => setEditRelDesc(e.target.value)} />
                                                                <button className="btn btn-primary btn-sm" style={{ padding: '1px 6px' }}
                                                                    onClick={handleSaveRelationEdit}>✓</button>
                                                                <button className="btn btn-secondary btn-sm" style={{ padding: '1px 6px' }}
                                                                    onClick={() => setEditingRelId(null)}>✕</button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>→</span>
                                                                <span style={{ flex: 1 }}>{getHostName(rel.targetHostId)}</span>
                                                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{rel.description}</span>
                                                                <button className="hr-tree-node-action" title={t('common.edit')}
                                                                    onClick={() => { setEditingRelId(rel.id); setEditRelTargetId(rel.targetHostId); setEditRelDesc(rel.description) }}>
                                                                    ✎
                                                                </button>
                                                                <button className="hr-tree-node-action hr-tree-node-action-danger" title={t('common.delete')}
                                                                    onClick={() => handleDeleteRelation(rel.id)}>
                                                                    ✕
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                ))}

                                                {/* Add new relation */}
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', gap: 6,
                                                    padding: '4px 8px', background: 'var(--surface-background, #f8fafc)',
                                                    borderRadius: 4, border: '1px dashed var(--border-color, #e2e8f0)',
                                                }}>
                                                    <span style={{ color: 'var(--text-secondary)', flexShrink: 0, fontSize: '0.8125rem' }}>→</span>
                                                    <select className="form-input" style={{ flex: 1, fontSize: '0.75rem', padding: '2px 4px' }}
                                                        value={bsNewRelTargetId} onChange={e => setBsNewRelTargetId(e.target.value)}>
                                                        <option value="">{t('hostResource.selectHost')}</option>
                                                        {hosts.map(h => (
                                                            <option key={h.id} value={h.id}>{h.name} ({h.ip})</option>
                                                        ))}
                                                    </select>
                                                    <input className="form-input" style={{ flex: 1, fontSize: '0.75rem', padding: '2px 4px' }}
                                                        placeholder={t('hostResource.relationDesc')}
                                                        value={bsNewRelDesc} onChange={e => setBsNewRelDesc(e.target.value)} />
                                                    <button className="btn btn-primary btn-sm" style={{ padding: '1px 8px' }}
                                                        disabled={!bsNewRelTargetId} onClick={handleAddRelation}>+</button>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                    <div className="form-group">
                                        <label className="form-label">{t('hostResource.bsTags')}</label>
                                        <input className="form-input" value={bsTags} onChange={e => setBsTags(e.target.value)} placeholder="Comma-separated tags" />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('hostResource.description')}</label>
                                        <input className="form-input" value={bsDescription} onChange={e => setBsDescription(e.target.value)} />
                                    </div>
                                </>
                            )}

                            {selectedType === 'host' && (
                                <>
                                    <h4 className="hr-section-label">{t('hostResource.basicInfo')}</h4>
                                    <div className="hr-form-row">
                                        <div className="form-group">
                                            <label className="form-label">{t('hostResource.hostName')}</label>
                                            <input className="form-input" value={hostName} onChange={e => setHostName(e.target.value)} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">{t('hostResource.hostname')}</label>
                                            <input className="form-input" value={hostname} onChange={e => setHostname(e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="hr-form-row">
                                        <div className="form-group">
                                            <label className="form-label">{t('hostResource.ip')}</label>
                                            <input className="form-input" value={hostIp} onChange={e => setHostIp(e.target.value)} placeholder="192.168.1.100 / 2409:808c:8a:109::20" />
                                        </div>
                                        <div className="form-group" style={{ maxWidth: 120 }}>
                                            <label className="form-label">{t('hostResource.port')}</label>
                                            <input className="form-input" type="number" value={hostPort} onChange={e => setHostPort(Number(e.target.value))} />
                                        </div>
                                    </div>

                                    <h4 className="hr-section-label">{t('hostResource.systemInfo')}</h4>
                                    <div className="hr-form-row">
                                        <div className="form-group">
                                            <label className="form-label">{t('hostResource.os')}</label>
                                            <input className="form-input" value={hostOs} onChange={e => setHostOs(e.target.value)} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">{t('hostResource.location')}</label>
                                            <input className="form-input" value={hostLocation} onChange={e => setHostLocation(e.target.value)} />
                                        </div>
                                    </div>

                                    <h4 className="hr-section-label">{t('hostResource.authInfo')}</h4>
                                    <div className="hr-form-row">
                                        <div className="form-group">
                                            <label className="form-label">{t('hostResource.username')}</label>
                                            <input className="form-input" value={hostUsername} onChange={e => setHostUsername(e.target.value)} />
                                        </div>
                                        <div className="form-group" style={{ maxWidth: 140 }}>
                                            <label className="form-label">{t('hostResource.authType')}</label>
                                            <select className="form-input" value={hostAuthType} onChange={e => setHostAuthType(e.target.value as 'password' | 'key')}>
                                                <option value="password">Password</option>
                                                <option value="key">Key</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('hostResource.credential')}</label>
                                        <input className="form-input" type="password" value={hostCredential} onChange={e => setHostCredential(e.target.value)} />
                                    </div>

                                    {/* ── Auto Discovery ── */}
                                    {editingItem?.type === 'host' && discoverPlan && (
                                        <div style={{ marginTop: 8 }}>
                                            {discoveryPhase === 'idle' && (
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={handleStartDiscovery}
                                                    style={{ width: '100%' }}
                                                >
                                                    {t('hostResource.autoDiscover', { defaultValue: 'Auto Discover' })}
                                                </button>
                                            )}
                                            {discoveryPhase === 'planning' && (
                                                <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary, #64748b)', fontSize: '0.8125rem' }}>
                                                    {t('hostResource.discoveryPlanning', { defaultValue: 'Generating discovery commands...' })}
                                                </div>
                                            )}
                                            {discoveryPhase === 'confirming' && (
                                                <div style={{
                                                    border: '1px solid var(--border-color, #e2e8f0)',
                                                    borderRadius: 6, padding: 12,
                                                }}>
                                                    <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: 8 }}>
                                                        {t('hostResource.discoveryCommands', { defaultValue: 'Discovery Commands (LLM Generated)' })}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
                                                        {discoveryCommands.map(cmd => (
                                                            <label key={cmd.label} style={{
                                                                display: 'flex', alignItems: 'flex-start', gap: 6,
                                                                padding: '4px 6px', borderRadius: 4,
                                                                background: selectedCommands.has(cmd.label) ? 'var(--surface-background, #f0f5ff)' : 'transparent',
                                                                fontSize: '0.8125rem', cursor: 'pointer',
                                                            }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedCommands.has(cmd.label)}
                                                                    onChange={() => {
                                                                        setSelectedCommands(prev => {
                                                                            const next = new Set(prev)
                                                                            next.has(cmd.label) ? next.delete(cmd.label) : next.add(cmd.label)
                                                                            return next
                                                                        })
                                                                    }}
                                                                    style={{ marginTop: 2 }}
                                                                />
                                                                <div style={{ flex: 1 }}>
                                                                    <div style={{ fontWeight: 500 }}>{cmd.label}</div>
                                                                    <input
                                                                        className="form-input"
                                                                        style={{ fontSize: '0.75rem', padding: '2px 4px', marginTop: 2 }}
                                                                        value={cmd.command}
                                                                        onChange={e => {
                                                                            setDiscoveryCommands(prev => prev.map(c =>
                                                                                c.label === cmd.label ? { ...c, command: e.target.value } : c
                                                                            ))
                                                                        }}
                                                                    />
                                                                    <div style={{ color: 'var(--text-secondary, #64748b)', fontSize: '0.7rem', marginTop: 1 }}>
                                                                        {cmd.purpose}
                                                                    </div>
                                                                </div>
                                                            </label>
                                                        ))}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                                        <button
                                                            className="btn btn-primary btn-sm"
                                                            onClick={handleRunSelected}
                                                            disabled={selectedCommands.size === 0}
                                                        >
                                                            {t('hostResource.runSelected', { defaultValue: 'Run Selected' })}
                                                        </button>
                                                        <button
                                                            className="btn btn-secondary btn-sm"
                                                            onClick={() => setDiscoveryPhase('idle')}
                                                        >
                                                            {t('common.cancel')}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            {discoveryPhase === 'executing' && (
                                                <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary, #64748b)', fontSize: '0.8125rem' }}>
                                                    {t('hostResource.discoveryExecuting', { defaultValue: 'Executing commands and analyzing...' })}
                                                </div>
                                            )}
                                            {discoveryPhase === 'results' && discoveryResult && (
                                                <div style={{
                                                    border: '1px solid var(--border-color, #e2e8f0)',
                                                    borderRadius: 6, padding: 12,
                                                }}>
                                                    <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: 8 }}>
                                                        {t('hostResource.discoveryResults', { defaultValue: 'Discovery Results' })}
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                                                        {discoveryResult.formMappings?.hostname && (
                                                            <label style={{
                                                                display: 'flex', alignItems: 'center', gap: 6,
                                                                padding: '3px 6px', borderRadius: 4,
                                                                background: selectedAttributes.has('hostname') ? 'var(--surface-background, #f0f5ff)' : 'transparent',
                                                                fontSize: '0.8125rem', cursor: 'pointer',
                                                            }}>
                                                                <input type="checkbox" checked={selectedAttributes.has('hostname')}
                                                                    onChange={() => {
                                                                        setSelectedAttributes(prev => {
                                                                            const next = new Set(prev)
                                                                            next.has('hostname') ? next.delete('hostname') : next.add('hostname')
                                                                            return next
                                                                        })
                                                                    }}
                                                                />
                                                                <span style={{ fontWeight: 500 }}>Hostname:</span>
                                                                <span>{discoveryResult.formMappings.hostname}</span>
                                                            </label>
                                                        )}
                                                        {discoveryResult.formMappings?.os && (
                                                            <label style={{
                                                                display: 'flex', alignItems: 'center', gap: 6,
                                                                padding: '3px 6px', borderRadius: 4,
                                                                background: selectedAttributes.has('os') ? 'var(--surface-background, #f0f5ff)' : 'transparent',
                                                                fontSize: '0.8125rem', cursor: 'pointer',
                                                            }}>
                                                                <input type="checkbox" checked={selectedAttributes.has('os')}
                                                                    onChange={() => {
                                                                        setSelectedAttributes(prev => {
                                                                            const next = new Set(prev)
                                                                            next.has('os') ? next.delete('os') : next.add('os')
                                                                            return next
                                                                        })
                                                                    }}
                                                                />
                                                                <span style={{ fontWeight: 500 }}>OS:</span>
                                                                <span>{discoveryResult.formMappings.os}</span>
                                                            </label>
                                                        )}
                                                        {discoveryResult.customAttributes?.map(attr => (
                                                            <label key={attr.key} style={{
                                                                display: 'flex', alignItems: 'center', gap: 6,
                                                                padding: '3px 6px', borderRadius: 4,
                                                                background: selectedAttributes.has(attr.key) ? 'var(--surface-background, #f0f5ff)' : 'transparent',
                                                                fontSize: '0.8125rem', cursor: 'pointer',
                                                            }}>
                                                                <input type="checkbox" checked={selectedAttributes.has(attr.key)}
                                                                    onChange={() => {
                                                                        setSelectedAttributes(prev => {
                                                                            const next = new Set(prev)
                                                                            next.has(attr.key) ? next.delete(attr.key) : next.add(attr.key)
                                                                            return next
                                                                        })
                                                                    }}
                                                                />
                                                                <span style={{ fontWeight: 500 }}>{attr.key}:</span>
                                                                <span>{attr.value}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                                        <button className="btn btn-primary btn-sm" onClick={handleApplyDiscovery}>
                                                            {t('hostResource.applySelected', { defaultValue: 'Apply Selected' })}
                                                        </button>
                                                        <button className="btn btn-secondary btn-sm" onClick={() => setDiscoveryPhase('idle')}>
                                                            {t('common.cancel')}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <h4 className="hr-section-label">{t('hostResource.businessInfo')}</h4>
                                    <div className="hr-form-row">
                                        <div className="form-group">
                                            <label className="form-label">{t('hostResource.cluster')}</label>
                                            <select className="form-input" value={hostClusterId} onChange={e => setHostClusterId(e.target.value)}>
                                                <option value="">{t('hostResource.noCluster')}</option>
                                                {clusters.map(c => (
                                                    <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">{t('hostResource.purpose')}</label>
                                            <input className="form-input" value={hostPurpose} onChange={e => setHostPurpose(e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="hr-form-row">
                                        <div className="form-group">
                                            <label className="form-label">{t('hostResource.business')}</label>
                                            <input className="form-input" value={hostBusiness} onChange={e => setHostBusiness(e.target.value)} />
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label className="form-label">{t('hostResource.description')}</label>
                                        <input className="form-input" value={hostDescription} onChange={e => setHostDescription(e.target.value)} />
                                    </div>

                                    <CustomAttributeEditor attributes={hostCustomAttributes} onChange={setHostCustomAttributes} />

                                    {/* ── Relations section (edit mode only) ── */}
                                    <h4 className="hr-section-label">{t('hostResource.topology')}</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {hostRelations.length === 0 && (
                                            <div style={{ color: 'var(--text-secondary, #64748b)', fontSize: '0.8125rem' }}>
                                                {t('hostResource.noSourceRelations', { defaultValue: '暂无出向关系' })}
                                            </div>
                                        )}
                                        {hostRelations.map(rel => (
                                            <div key={rel.id} style={{
                                                display: 'flex', alignItems: 'center', gap: 6,
                                                padding: '4px 8px', border: '1px solid var(--border-color, #e2e8f0)',
                                                borderRadius: 4, fontSize: '0.8125rem',
                                            }}>
                                                {editingRelId === rel.id ? (
                                                    <>
                                                        <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>→</span>
                                                        <select className="form-input" style={{ flex: 1, fontSize: '0.75rem', padding: '2px 4px' }}
                                                            value={editRelTargetId} onChange={e => setEditRelTargetId(e.target.value)}>
                                                            {hosts.filter(h => h.id !== editingItem?.data?.id).map(h => (
                                                                <option key={h.id} value={h.id}>{h.name} ({h.ip})</option>
                                                            ))}
                                                        </select>
                                                        <input className="form-input" style={{ flex: 1, fontSize: '0.75rem', padding: '2px 4px' }}
                                                            value={editRelDesc} onChange={e => setEditRelDesc(e.target.value)} />
                                                        <button className="btn btn-primary btn-sm" style={{ padding: '1px 6px' }}
                                                            onClick={handleSaveRelationEdit}>✓</button>
                                                        <button className="btn btn-secondary btn-sm" style={{ padding: '1px 6px' }}
                                                            onClick={() => setEditingRelId(null)}>✕</button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>→</span>
                                                        <span style={{ flex: 1 }}>{getHostName(rel.targetHostId)}</span>
                                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{rel.description}</span>
                                                        <button className="hr-tree-node-action" title={t('common.edit')}
                                                            onClick={() => { setEditingRelId(rel.id); setEditRelTargetId(rel.targetHostId); setEditRelDesc(rel.description) }}>
                                                            ✎
                                                        </button>
                                                        <button className="hr-tree-node-action hr-tree-node-action-danger" title={t('common.delete')}
                                                            onClick={() => handleDeleteRelation(rel.id)}>
                                                            ✕
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        ))}

                                        {/* Add new relation */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 6,
                                            padding: '4px 8px', background: 'var(--surface-background, #f8fafc)',
                                            borderRadius: 4, border: '1px dashed var(--border-color, #e2e8f0)',
                                        }}>
                                            <span style={{ color: 'var(--text-secondary)', flexShrink: 0, fontSize: '0.8125rem' }}>→</span>
                                            <select className="form-input" style={{ flex: 1, fontSize: '0.75rem', padding: '2px 4px' }}
                                                value={newRelTargetId} onChange={e => setNewRelTargetId(e.target.value)}>
                                                <option value="">{t('hostResource.selectHost')}</option>
                                                {hosts.filter(h => h.id !== editingItem?.data?.id).map(h => (
                                                    <option key={h.id} value={h.id}>{h.name} ({h.ip})</option>
                                                ))}
                                            </select>
                                            <input className="form-input" style={{ flex: 1, fontSize: '0.75rem', padding: '2px 4px' }}
                                                placeholder={t('hostResource.relationDesc')}
                                                value={newRelDesc} onChange={e => setNewRelDesc(e.target.value)} />
                                            <button className="btn btn-primary btn-sm" style={{ padding: '1px 8px' }}
                                                disabled={!newRelTargetId} onClick={handleAddRelation}>+</button>
                                        </div>
                                    </div>
                                </>
                            )}

                            {selectedType === 'relation' && (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">{t('hostResource.sourceType')}</label>
                                        <select className="form-input" value={sourceType} onChange={e => { setSourceType(e.target.value as 'host' | 'business-service'); setSourceHostId('') }}>
                                            <option value="host">{t('hostResource.sourceTypeHost')}</option>
                                            <option value="business-service">{t('hostResource.sourceTypeBusinessService')}</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">
                                            {sourceType === 'business-service'
                                                ? t('hostResource.sourceBusinessService')
                                                : t('hostResource.sourceHost')}
                                        </label>
                                        {sourceType === 'business-service' ? (
                                            <select className="form-input" value={sourceHostId} onChange={e => setSourceHostId(e.target.value)}>
                                                <option value="">{t('hostResource.selectBusinessService')}</option>
                                                {businessServices.map(bs => (
                                                    <option key={bs.id} value={bs.id}>{bs.name}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <select className="form-input" value={sourceHostId} onChange={e => setSourceHostId(e.target.value)}>
                                                <option value="">{t('hostResource.selectHost')}</option>
                                                {hosts.map(h => (
                                                    <option key={h.id} value={h.id}>{h.name} ({h.ip})</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('hostResource.targetHost')}</label>
                                        <select className="form-input" value={targetHostId} onChange={e => setTargetHostId(e.target.value)}>
                                            <option value="">{t('hostResource.selectHost')}</option>
                                            {hosts.map(h => (
                                                <option key={h.id} value={h.id}>{h.name} ({h.ip})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{t('hostResource.relationDesc')}</label>
                                        <input className="form-input" value={relationDescription} onChange={e => setRelationDescription(e.target.value)} placeholder="e.g. 数据库访问" />
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !canSave()}>
                                {saving ? t('common.saving') : t('common.save')}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
