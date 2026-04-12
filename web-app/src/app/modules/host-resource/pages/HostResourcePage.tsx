import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeader from '../../../platform/ui/primitives/PageHeader'
import { useHostGroups } from '../hooks/useHostGroups'
import { useClusters } from '../hooks/useClusters'
import { useHostResource } from '../hooks/useHostResource'
import { useHostRelations } from '../hooks/useHostRelations'
import ResourceTree, { type TreeNode, type TreeNodeType } from '../components/ResourceTree'
import ResourceFormModal from '../components/ResourceFormModal'
import HostCard from '../components/HostCard'
import RelationGraph from '../components/RelationGraph'
import type { HostGroup, Cluster, Host, HostCreateRequest } from '../../../../types/host'
import '../styles/host-resource.css'

type SelectedNode = {
    id: string
    type: TreeNodeType
}

type EditingItem =
    | { type: 'group'; data: HostGroup }
    | { type: 'cluster'; data: Cluster }
    | { type: 'host'; data: Host }
    | null

const PAGE_SIZE = 6

export default function HostResourcePage() {
    const { t } = useTranslation()
    const [selected, setSelected] = useState<SelectedNode | null>(null)
    const [focusedHostId, setFocusedHostId] = useState<string | null>(null)
    const [hopFocusId, setHopFocusId] = useState<string | null>(null)
    const [showModal, setShowModal] = useState(false)
    const [editingItem, setEditingItem] = useState<EditingItem>(null)
    const [currentPage, setCurrentPage] = useState(1)

    // Data hooks
    const { groups, fetchGroups, createGroup, updateGroup, deleteGroup } = useHostGroups()
    const { clusters, fetchAllClusters, createCluster, updateCluster, deleteCluster } = useClusters()
    const { hosts, allHosts, fetchHosts, fetchAllHosts, createHost, updateHost, deleteHost, discoverPlan, discoverExecute } = useHostResource()
    const { graphData, relations: hostRelations, fetchGraph, fetchRelations: fetchHostRelations, createRelation, updateRelation, deleteRelation } = useHostRelations()

    // Load all data on mount
    useEffect(() => { fetchGroups() }, [fetchGroups])
    useEffect(() => { fetchAllClusters() }, [fetchAllClusters])
    useEffect(() => { fetchAllHosts() }, [fetchAllHosts])

    // Fetch hosts based on tree selection
    useEffect(() => {
        if (selected?.type === 'cluster') {
            fetchHosts(selected.id, undefined)
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
        } else if (selected?.type === 'group' || selected?.type === 'subgroup') {
            fetchGraph(undefined, selected.id)
        } else {
            fetchGraph()
        }
    }, [selected, fetchGraph])

    // Build tree data — only to cluster level (no host children)
    const treeData = useMemo((): TreeNode[] => {
        const clusterHostMap = new Map<string, number>()
        for (const h of allHosts) {
            if (h.clusterId) {
                clusterHostMap.set(h.clusterId, (clusterHostMap.get(h.clusterId) || 0) + 1)
            }
        }

        const topGroups = groups.filter(g => !g.parentId)
        const subGroups = groups.filter(g => g.parentId)

        return topGroups.map(g => {
            const children: TreeNode[] = []

            // Sub-groups with their clusters
            const mySubGroups = subGroups.filter(sg => sg.parentId === g.id)
            const subGroupClusterIds = new Set<string>()

            for (const sg of mySubGroups) {
                const sgClusters = clusters.filter(c => c.groupId === sg.id)
                sgClusters.forEach(c => subGroupClusterIds.add(c.id))

                const sgChildren: TreeNode[] = sgClusters.map(c => ({
                    id: c.id,
                    type: 'cluster' as TreeNodeType,
                    name: c.name,
                    subtitle: c.type + (clusterHostMap.has(c.id) ? ` (${clusterHostMap.get(c.id)} ${t('hostResource.hostCountUnit')})` : ''),
                    raw: c,
                }))

                children.push({
                    id: sg.id,
                    type: 'subgroup' as TreeNodeType,
                    name: sg.name,
                    children: sgChildren,
                    raw: sg,
                })
            }

            // Clusters directly under this top-level group
            const directClusters = clusters.filter(c => c.groupId === g.id && !subGroupClusterIds.has(c.id))
            for (const c of directClusters) {
                children.push({
                    id: c.id,
                    type: 'cluster' as TreeNodeType,
                    name: c.name,
                    subtitle: c.type + (clusterHostMap.has(c.id) ? ` (${clusterHostMap.get(c.id)} ${t('hostResource.hostCountUnit')})` : ''),
                    raw: c,
                })
            }

            return {
                id: g.id,
                type: 'group' as TreeNodeType,
                name: g.name,
                children,
                raw: g,
            }
        })
    }, [groups, clusters, allHosts, t])

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
        } else if (type === 'cluster') {
            const c = clusters.find(c => c.id === id)
            if (c) {
                setEditingItem({ type: 'cluster', data: c })
                setShowModal(true)
            }
        }
    }, [groups, clusters])

    const handleTreeDelete = useCallback(async (id: string, type: TreeNodeType) => {
        if (type === 'group' || type === 'subgroup') {
            if (confirm(t('hostResource.confirmDeleteGroup'))) {
                try {
                    await deleteGroup(id)
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
                    alert(err instanceof Error ? err.message : 'Failed')
                }
            }
        }
    }, [deleteGroup, deleteCluster, selected, t])

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

    const openCreateModal = useCallback(() => {
        setEditingItem(null)
        setShowModal(true)
    }, [])

    const openEditModal = useCallback((item: EditingItem) => {
        setEditingItem(item)
        setShowModal(true)
    }, [])

    return (
        <div className="page-container resource-page">
            <PageHeader
                title={t('hostResource.title')}
                action={
                    <button className="btn btn-primary btn-sm" onClick={openCreateModal}>
                        + {t('hostResource.createResource')}
                    </button>
                }
            />

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

            {/* Create/Edit Modal */}
            {showModal && (
                <ResourceFormModal
                    editingItem={editingItem}
                    groups={groups}
                    clusters={clusters}
                    hosts={allHosts}
                    defaultGroupId={defaultGroupIdForCreate}
                    defaultClusterId={defaultClusterIdForCreate}
                    hostRelations={hostRelations}
                    fetchHostRelations={fetchHostRelations}
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
