import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '../../../platform/ui/primitives/PageHeader'
import { useHostGroups } from '../hooks/useHostGroups'
import { useClusters } from '../hooks/useClusters'
import { useHostResource } from '../hooks/useHostResource'
import { useHostRelations } from '../hooks/useHostRelations'
import { useBusinessServices } from '../hooks/useBusinessServices'
import { useClusterTypes } from '../hooks/useClusterTypes'
import { useBusinessTypes } from '../hooks/useBusinessTypes'
import ResourceTree, { type TreeNode, type TreeNodeType } from '../components/ResourceTree'
import ResourceFormModal from '../components/ResourceFormModal'
import HostCard from '../components/HostCard'
import RelationGraph from '../components/RelationGraph'
import ClusterTypeTab from '../components/ClusterTypeTab'
import BusinessTypeTab from '../components/BusinessTypeTab'
import type { HostGroup, Cluster, Host, HostCreateRequest, BusinessService } from '../../../../types/host'
import '../styles/host-resource.css'

type SelectedNode = {
    id: string
    type: TreeNodeType
}

type EditingItem =
    | { type: 'group'; data: HostGroup }
    | { type: 'cluster'; data: Cluster }
    | { type: 'business-service'; data: BusinessService }
    | { type: 'host'; data: Host }
    | null

type TabKey = 'overview' | 'cluster-types' | 'business-types'

const PAGE_SIZE = 6

export default function HostResourcePage() {
    const { t } = useTranslation()
    const [activeTab, setActiveTab] = useState<TabKey>('overview')
    const [selected, setSelected] = useState<SelectedNode | null>(null)
    const [focusedHostId, setFocusedHostId] = useState<string | null>(null)
    const [hopFocusId, setHopFocusId] = useState<string | null>(null)
    const [showModal, setShowModal] = useState(false)
    const [editingItem, setEditingItem] = useState<EditingItem>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [importing, setImporting] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Data hooks
    const { groups, fetchGroups, createGroup, updateGroup, deleteGroup } = useHostGroups()
    const { clusters, fetchAllClusters, createCluster, updateCluster, deleteCluster } = useClusters()
    const { hosts, allHosts, fetchHosts, fetchAllHosts, createHost, updateHost, deleteHost, discoverPlan, discoverExecute } = useHostResource()
    const { graphData, relations: hostRelations, fetchGraph, fetchRelations: fetchHostRelations, createRelation, updateRelation, deleteRelation } = useHostRelations()
    const { businessServices, fetchBusinessServices, createBusinessService, updateBusinessService, deleteBusinessService } = useBusinessServices()
    const clusterTypesHook = useClusterTypes()
    const businessTypesHook = useBusinessTypes()

    // Load all data on mount
    useEffect(() => { fetchGroups() }, [fetchGroups])
    useEffect(() => { fetchAllClusters() }, [fetchAllClusters])
    useEffect(() => { fetchAllHosts() }, [fetchAllHosts])
    useEffect(() => { fetchHostRelations() }, [fetchHostRelations])
    useEffect(() => { fetchBusinessServices() }, [fetchBusinessServices])

    // Resolve the province-level group ID for a business service by walking up the tree
    // until we find a group whose parent is a root group (no parentId).
    // This works for any nesting depth: 1-level, 2-level, 3-level, etc.
    const resolveProvinceGroupId = useCallback((bs: BusinessService): string | undefined => {
        let current = groups.find(g => g.id === bs.groupId)
        if (!current) return undefined

        // Walk up until we find a group whose parent is a root group
        while (current?.parentId) {
            const parent = groups.find(g => g.id === current!.parentId)
            if (!parent?.parentId) {
                // current's parent is a root group → current is the province-level group
                return current.id
            }
            current = parent
        }

        // BS is in a root group or group with no parent → return its own group ID
        return current?.id
    }, [groups])

    // Fetch hosts based on tree selection
    useEffect(() => {
        if (selected?.type === 'cluster') {
            fetchHosts(selected.id, undefined)
        } else if (selected?.type === 'business-service') {
            fetchHosts(undefined, undefined, selected.id)
        } else if (selected?.type === 'group' || selected?.type === 'subgroup') {
            fetchHosts(undefined, selected.id)
        } else {
            fetchHosts()
        }
    }, [selected, fetchHosts])

    // Fetch graph based on tree selection
    useEffect(() => {
        if (selected?.type === 'cluster') {
            fetchGraph(selected.id)
            setFocusedHostId(null)
            setHopFocusId(null)
        } else if (selected?.type === 'business-service') {
            const bs = businessServices.find(b => b.id === selected.id)
            if (bs) {
                const provinceId = resolveProvinceGroupId(bs)
                fetchGraph(undefined, provinceId)
            } else {
                fetchGraph()
            }
            setFocusedHostId(selected.id)
        } else if (selected?.type === 'group' || selected?.type === 'subgroup') {
            fetchGraph(undefined, selected.id)
            setFocusedHostId(null)
            setHopFocusId(null)
        } else {
            fetchGraph()
            setFocusedHostId(null)
            setHopFocusId(null)
        }
    }, [selected, fetchGraph, businessServices, resolveProvinceGroupId])

    // Build tree data — recursive, supports arbitrary nesting depth
    const treeData = useMemo((): TreeNode[] => {
        const clusterHostMap = new Map<string, number>()
        for (const h of allHosts) {
            if (h.clusterId) {
                clusterHostMap.set(h.clusterId, (clusterHostMap.get(h.clusterId) || 0) + 1)
            }
        }

        // Index children by parentId
        const childrenMap = new Map<string, HostGroup[]>()
        for (const g of groups) {
            if (g.parentId) {
                const list = childrenMap.get(g.parentId) || []
                list.push(g)
                childrenMap.set(g.parentId, list)
            }
        }

        const buildGroupNode = (g: HostGroup): TreeNode => {
            const childGroups = childrenMap.get(g.id) || []
            const childNodes: TreeNode[] = []

            // Recursively build child group nodes first
            for (const cg of childGroups) {
                childNodes.push(buildGroupNode(cg))
            }

            // Business services under this group
            const groupBs = businessServices.filter(bs => bs.groupId === g.id)
            for (const bs of groupBs) {
                const hostNames = bs.hostIds
                    .map(hid => allHosts.find(h => h.id === hid)?.name)
                    .filter(Boolean)
                    .join(', ')
                childNodes.push({
                    id: bs.id,
                    type: 'business-service' as TreeNodeType,
                    name: bs.name,
                    subtitle: hostNames || bs.code,
                    raw: bs,
                })
            }

            // Clusters under this group
            const groupClusters = clusters.filter(c => c.groupId === g.id)
            for (const c of groupClusters) {
                childNodes.push({
                    id: c.id,
                    type: 'cluster' as TreeNodeType,
                    name: c.name,
                    subtitle: c.type + (clusterHostMap.has(c.id) ? ` (${clusterHostMap.get(c.id)} ${t('hostResource.hostCountUnit')})` : ''),
                    raw: c,
                })
            }

            return {
                id: g.id,
                type: 'subgroup' as TreeNodeType,
                name: g.name,
                children: childNodes.length > 0 ? childNodes : undefined,
                raw: g,
            }
        }

        // Root groups (no parentId) become top-level tree nodes
        const rootGroups = groups.filter(g => !g.parentId)
        return rootGroups.map(g => {
            const node = buildGroupNode(g)
            return { ...node, type: 'group' as TreeNodeType }
        })
    }, [groups, clusters, allHosts, businessServices, t])

    // Build cluster lookup for HostCard
    const clusterMap = useMemo(() => {
        const map = new Map<string, Cluster>()
        for (const c of clusters) map.set(c.id, c)
        return map
    }, [clusters])

    const handleSelect = useCallback((id: string, type: TreeNodeType) => {
        setSelected(prev => prev?.id === id && prev?.type === type ? prev : { id, type })
        setFocusedHostId(null)
        setHopFocusId(null)
        setCurrentPage(1)
    }, [])

    const handleTreeEdit = useCallback((id: string, type: TreeNodeType) => {
        if (type === 'group' || type === 'subgroup') {
            const g = groups.find(g => g.id === id)
            if (g) {
                setEditingItem({ type: 'group', data: g })
                setShowModal(true)
            }
        } else if (type === 'business-service') {
            const bs = businessServices.find(b => b.id === id)
            if (bs) {
                setEditingItem({ type: 'business-service', data: bs })
                setShowModal(true)
            }
        } else if (type === 'cluster') {
            const c = clusters.find(c => c.id === id)
            if (c) {
                setEditingItem({ type: 'cluster', data: c })
                setShowModal(true)
            }
        }
    }, [groups, clusters, businessServices])

    const handleTreeDelete = useCallback(async (id: string, type: TreeNodeType) => {
        if (type === 'group' || type === 'subgroup') {
            if (confirm(t('hostResource.confirmDeleteGroup'))) {
                try {
                    await deleteGroup(id)
                    if (selected?.id === id) setSelected(null)
                } catch (err) {
                    if ((err as any)?.status === 409 && confirm(t('hostResource.confirmForceDeleteGroup'))) {
                        try {
                            await deleteGroup(id, true)
                            if (selected?.id === id) setSelected(null)
                        } catch (err2) {
                            alert(err2 instanceof Error ? err2.message : 'Failed')
                        }
                    } else if ((err as any)?.status !== 409) {
                        alert(err instanceof Error ? err.message : 'Failed')
                    }
                }
            }
        } else if (type === 'business-service') {
            if (confirm(t('hostResource.confirmDeleteBusinessService'))) {
                try {
                    await deleteBusinessService(id)
                    if (selected?.id === id) setSelected(null)
                } catch (err) {
                    alert(err instanceof Error ? err.message : 'Failed')
                }
            }
        } else if (type === 'cluster') {
            if (confirm(t('hostResource.confirmDeleteCluster'))) {
                try {
                    await deleteCluster(id)
                    if (selected?.id === id) setSelected(null)
                } catch (err) {
                    if ((err as any)?.status === 409 && confirm(t('hostResource.confirmForceDeleteCluster'))) {
                        try {
                            await deleteCluster(id, true)
                            if (selected?.id === id) setSelected(null)
                        } catch (err2) {
                            alert(err2 instanceof Error ? err2.message : 'Failed')
                        }
                    } else if ((err as any)?.status !== 409) {
                        alert(err instanceof Error ? err.message : 'Failed')
                    }
                }
            }
        }
    }, [deleteGroup, deleteCluster, deleteBusinessService, selected, t])

    const handleDeleteHost = useCallback(async (host: Host) => {
        if (confirm(t('hostResource.confirmDeleteHost'))) {
            try {
                await deleteHost(host.id)
                if (focusedHostId === host.id) setFocusedHostId(null)
                if (hopFocusId === host.id) setHopFocusId(null)
            } catch (err) {
                alert(err instanceof Error ? err.message : 'Failed')
            }
        }
    }, [deleteHost, focusedHostId, t])

    const handleHostCardClick = useCallback((host: Host) => {
        setFocusedHostId(prev => prev === host.id ? null : host.id)
    }, [])

    const defaultGroupIdForCreate = selected?.type === 'group' || selected?.type === 'subgroup' ? selected.id : undefined
    const defaultClusterIdForCreate = selected?.type === 'cluster' ? selected.id : undefined

    // Pagination
    const totalPages = Math.max(1, Math.ceil(hosts.length / PAGE_SIZE))
    const safePage = Math.min(currentPage, totalPages)
    const paginatedHosts = hosts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

    const handleExport = useCallback(() => {
        const data = {
            version: 3,
            exportedAt: new Date().toISOString(),
            clusterTypes: clusterTypesHook.clusterTypes.map(ct => ({
                name: ct.name, code: ct.code, description: ct.description,
                color: ct.color, knowledge: ct.knowledge,
            })),
            businessTypes: businessTypesHook.businessTypes.map(bt => ({
                name: bt.name, code: bt.code, description: bt.description,
                color: bt.color, knowledge: bt.knowledge,
            })),
            groups: groups.map(({ id, name, parentId, description }) => ({ id, name, parentId, description })),
            clusters: clusters.map(({ id, name, type, purpose, groupId, description }) => ({ id, name, type, purpose, groupId, description })),
            businessServices: businessServices.map(({ id, name, code, groupId, businessTypeId, description, hostIds, tags, priority, contactInfo }) =>
                ({ id, name, code, groupId, businessTypeId, description, hostIds, tags, priority, contactInfo })),
            hosts: allHosts.map(({ id, name, hostname, ip, port, os, location, username, authType, business, clusterId, purpose, tags, description, customAttributes }) =>
                ({ id, name, hostname, ip, port, os, location, username, authType, business, clusterId, purpose, tags, description, customAttributes })),
            relations: hostRelations.map(({ id, sourceHostId, targetHostId, description }) => ({ id, sourceHostId, targetHostId, description })),
        }
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ops-resources-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
        a.click()
        URL.revokeObjectURL(url)
    }, [groups, clusters, businessServices, allHosts, hostRelations, clusterTypesHook.clusterTypes, businessTypesHook.businessTypes])

    const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        try {
            const text = await file.text()
            const data = JSON.parse(text)
            if ((!data.version || data.version < 1 || data.version > 3) || !data.groups || !data.clusters || !data.hosts) {
                alert(t('hostResource.invalidFile'))
                return
            }

            setImporting(true)
            const groupIdMap = new Map<string, string>()
            const clusterIdMap = new Map<string, string>()
            const hostIdMap = new Map<string, string>()

            // 0. Cluster types (v3+)
            let ctCount = 0
            if (data.clusterTypes) {
                for (const ct of data.clusterTypes) {
                    try {
                        await clusterTypesHook.createClusterType(ct)
                        ctCount++
                    } catch { /* skip duplicate or failed */ }
                }
            }

            // 0b. Business types (v3+)
            let btCount = 0
            if (data.businessTypes) {
                for (const bt of data.businessTypes) {
                    try {
                        await businessTypesHook.createBusinessType(bt)
                        btCount++
                    } catch { /* skip duplicate or failed */ }
                }
            }

            // 1. Groups (preserve hierarchy via parentId remapping)
            for (const g of data.groups) {
                const remapped = { ...g, parentId: g.parentId ? groupIdMap.get(g.parentId) : undefined }
                const created = await createGroup(remapped)
                groupIdMap.set(g.id, created.id)
            }

            // 2. Clusters
            for (const c of data.clusters) {
                const remapped = { ...c, groupId: c.groupId ? groupIdMap.get(c.groupId) : undefined }
                const created = await createCluster(remapped)
                clusterIdMap.set(c.id, created.id)
            }

            // 3. Business services (v2+)
            let bsCount = 0
            if (data.businessServices) {
                for (const bs of data.businessServices) {
                    const remapped = {
                        ...bs,
                        groupId: bs.groupId ? groupIdMap.get(bs.groupId) : undefined,
                        hostIds: (bs.hostIds || []).map((hid: string) => hostIdMap.get(hid)).filter(Boolean),
                    }
                    try {
                        await createBusinessService(remapped)
                        bsCount++
                    } catch { /* skip failed */ }
                }
            }

            // 4. Hosts (credential empty, needs user to re-enter)
            for (const h of data.hosts) {
                const remapped = {
                    ...h,
                    clusterId: h.clusterId ? clusterIdMap.get(h.clusterId) : undefined,
                    credential: '',
                }
                const created = await createHost(remapped as HostCreateRequest)
                hostIdMap.set(h.id, created.id)
            }

            // 5. Relations
            let relCount = 0
            for (const r of (data.relations || [])) {
                const newSource = hostIdMap.get(r.sourceHostId)
                const newTarget = hostIdMap.get(r.targetHostId)
                if (newSource && newTarget) {
                    await createRelation({ sourceHostId: newSource, targetHostId: newTarget, description: r.description })
                    relCount++
                }
            }

            alert(t('hostResource.importSuccess', {
                groups: groupIdMap.size, clusters: clusterIdMap.size,
                hosts: hostIdMap.size, relations: relCount,
            }))

            // Refresh all data
            await Promise.all([fetchGroups(), fetchAllClusters(), fetchAllHosts(), fetchHostRelations(), fetchGraph(), fetchBusinessServices()])
        } catch (err) {
            alert(t('hostResource.importFailed', { error: err instanceof Error ? err.message : String(err) }))
        } finally {
            setImporting(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }, [t, createGroup, createCluster, createHost, createRelation, createBusinessService, clusterTypesHook.createClusterType, businessTypesHook.createBusinessType, fetchGroups, fetchAllClusters, fetchAllHosts, fetchHostRelations, fetchGraph, fetchBusinessServices])

    const openCreateModal = useCallback(() => {
        setEditingItem(null)
        setShowModal(true)
    }, [])

    const openEditModal = useCallback((item: EditingItem) => {
        setEditingItem(item)
        setShowModal(true)
    }, [])

    const tabs: { key: TabKey; label: string }[] = [
        { key: 'overview', label: t('hostResource.tabOverview') },
        { key: 'cluster-types', label: t('hostResource.tabClusterTypes') },
        { key: 'business-types', label: t('hostResource.tabBusinessTypes') },
    ]

    return (
        <div className="page-container page-shell-fluid host-resource-page">
            <PageHeader
                title={t('hostResource.title')}
                action={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-2, 8px)' }}>
                        <button className="btn btn-secondary btn-sm" onClick={handleExport} disabled={importing || allHosts.length === 0}>
                            {t('hostResource.export')}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                            {importing ? t('hostResource.importing', { current: 0, total: 0 }) : t('hostResource.import')}
                        </button>
                        <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
                    </div>
                }
            />

            {/* Tab bar with create action */}
            <div className="hr-tabs">
                <div className="hr-tabs-left">
                    {tabs.map(tab => (
                        <button
                            key={tab.key}
                            className={`hr-tab ${activeTab === tab.key ? 'hr-tab-active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className="hr-tabs-actions">
                    {activeTab === 'overview' && (
                        <button className="btn btn-primary btn-sm" onClick={openCreateModal}>
                            + {t('hostResource.createResource')}
                        </button>
                    )}
                </div>
            </div>

            {/* Tab content */}
            {activeTab === 'overview' && (
                <>

                    <div className="hr-layout-main">
                        {/* Left: Resource Tree */}
                        <div className="hr-tree-sidebar">
                            <ResourceTree
                                tree={treeData}
                                selectedId={selected?.id ?? null}
                                selectedType={selected?.type ?? null}
                                onSelect={handleSelect}
                                onEdit={handleTreeEdit}
                                onDelete={handleTreeDelete}
                            />
                        </div>

                        {/* Right: Host Cards */}
                        <div className="hr-cards-area">
                            {hosts.length === 0 ? (
                                <div className="hr-empty">{t('hostResource.noHosts')}</div>
                            ) : (
                                <>
                                    <div className="hr-host-grid">
                                        {paginatedHosts.map(host => (
                                            <HostCard
                                                key={host.id}
                                                host={host}
                                                cluster={host.clusterId ? clusterMap.get(host.clusterId) : undefined}
                                                selected={focusedHostId === host.id}
                                                onClick={() => handleHostCardClick(host)}
                                                onEdit={() => openEditModal({ type: 'host', data: host })}
                                                onDelete={() => handleDeleteHost(host)}
                                            />
                                        ))}
                                    </div>
                                    {totalPages > 1 && (
                                        <div className="hr-pagination">
                                            <span className="hr-pagination-info">
                                                {t('common.showing', {
                                                    start: (safePage - 1) * PAGE_SIZE + 1,
                                                    end: Math.min(safePage * PAGE_SIZE, hosts.length),
                                                    total: hosts.length,
                                                })}
                                            </span>
                                            <div className="hr-pagination-controls">
                                                <button
                                                    className="hr-pagination-btn"
                                                    disabled={safePage <= 1}
                                                    onClick={() => setCurrentPage(safePage - 1)}
                                                >
                                                    {t('common.previousPage')}
                                                </button>
                                                <span className="hr-pagination-page">{safePage} / {totalPages}</span>
                                                <button
                                                    className="hr-pagination-btn"
                                                    disabled={safePage >= totalPages}
                                                    onClick={() => setCurrentPage(safePage + 1)}
                                                >
                                                    {t('common.nextPage')}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Bottom: Topology */}
                    <div className="hr-topology-area">
                        <RelationGraph
                            data={graphData}
                            focusedHostId={focusedHostId}
                            hopFocusId={hopFocusId}
                            onNodeClick={(nodeId) => {
                                setFocusedHostId(prev => prev === nodeId ? null : nodeId)
                            }}
                            onNodeDoubleClick={(nodeId) => {
                                setHopFocusId(prev => prev === nodeId ? null : nodeId)
                            }}
                            onBackgroundClick={() => {
                                setFocusedHostId(null)
                                setHopFocusId(null)
                            }}
                        />
                    </div>
                </>
            )}

            {activeTab === 'cluster-types' && (
                <ClusterTypeTab
                    clusterTypes={clusterTypesHook.clusterTypes}
                    loading={clusterTypesHook.loading}
                    onCreate={clusterTypesHook.createClusterType}
                    onUpdate={clusterTypesHook.updateClusterType}
                    onDelete={clusterTypesHook.deleteClusterType}
                />
            )}

            {activeTab === 'business-types' && (
                <BusinessTypeTab
                    businessTypes={businessTypesHook.businessTypes}
                    loading={businessTypesHook.loading}
                    onCreate={businessTypesHook.createBusinessType}
                    onUpdate={businessTypesHook.updateBusinessType}
                    onDelete={businessTypesHook.deleteBusinessType}
                />
            )}

            {/* Create/Edit Modal */}
            {showModal && (
                <ResourceFormModal
                    key={editingItem?.type === 'business-service' ? `bs-${editingItem.data.id}` : editingItem?.type === 'cluster' ? `cl-${editingItem.data.id}` : editingItem?.type === 'group' ? `gr-${editingItem.data.id}` : editingItem?.type === 'host' ? `h-${editingItem.data.id}` : 'create'}
                    editingItem={editingItem}
                    groups={groups}
                    clusters={clusters}
                    hosts={allHosts}
                    defaultGroupId={defaultGroupIdForCreate}
                    defaultClusterId={defaultClusterIdForCreate}
                    hostRelations={hostRelations}
                    fetchHostRelations={fetchHostRelations}
                    clusterTypes={clusterTypesHook.clusterTypes}
                    businessTypes={businessTypesHook.businessTypes}
                    onClose={() => { setShowModal(false); setEditingItem(null) }}
                    onSaveGroup={async (data) => {
                        if (editingItem?.type === 'group') {
                            await updateGroup(editingItem.data.id, data)
                        } else {
                            await createGroup(data)
                        }
                    }}
                    onSaveCluster={async (data) => {
                        if (editingItem?.type === 'cluster') {
                            await updateCluster(editingItem.data.id, data)
                        } else {
                            await createCluster(data)
                        }
                    }}
                    onSaveBusinessService={async (data) => {
                        if (editingItem?.type === 'business-service') {
                            await updateBusinessService(editingItem.data.id, data)
                        } else {
                            await createBusinessService(data)
                        }
                    }}
                    onSaveHost={async (data) => {
                        if (editingItem?.type === 'host') {
                            await updateHost(editingItem.data.id, data as Partial<Host>)
                        } else {
                            await createHost(data as unknown as HostCreateRequest)
                        }
                    }}
                    onSaveRelation={createRelation}
                    onUpdateRelation={updateRelation}
                    onDeleteRelation={deleteRelation}
                    discoverPlan={discoverPlan}
                    discoverExecute={discoverExecute}
                />
            )}
        </div>
    )
}
