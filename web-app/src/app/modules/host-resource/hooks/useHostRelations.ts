import { useState, useCallback } from 'react'
import { GATEWAY_URL, gatewayHeaders } from '../../../../config/runtime'
import { useUser } from '../../../platform/providers/UserContext'
import type { HostRelation, GraphData } from '../../../../types/host'

function apiBase() { return `${GATEWAY_URL}/host-relations` }

export function useHostRelations() {
    const { userId } = useUser()
    const [relations, setRelations] = useState<HostRelation[]>([])
    const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] })
    const [loading, setLoading] = useState(false)

    const fetchRelations = useCallback(async (groupId?: string, hostId?: string, sourceType?: string, sourceId?: string) => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (hostId) params.set('hostId', hostId)
            else if (groupId) params.set('groupId', groupId)
            if (sourceType) params.set('sourceType', sourceType)
            if (sourceId) params.set('sourceId', sourceId)
            const qs = params.toString()
            const res = await fetch(`${apiBase()}${qs ? '?' + qs : ''}`, { headers: gatewayHeaders(userId) })
            const data = await res.json()
            setRelations(data.relations || [])
        } catch (err) {
            console.error('Failed to fetch relations', err)
        } finally {
            setLoading(false)
        }
    }, [userId])

    const fetchGraph = useCallback(async (clusterId?: string, groupId?: string) => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (clusterId) params.set('clusterId', clusterId)
            else if (groupId) params.set('groupId', groupId)
            const qs = params.toString()
            const res = await fetch(`${apiBase()}/graph${qs ? '?' + qs : ''}`, { headers: gatewayHeaders(userId) })
            const data = await res.json()
            setGraphData(data)
        } catch (err) {
            console.error('Failed to fetch graph data', err)
        } finally {
            setLoading(false)
        }
    }, [userId])

    const createRelation = useCallback(async (body: Partial<HostRelation>) => {
        const res = await fetch(apiBase(), {
            method: 'POST',
            headers: gatewayHeaders(userId),
            body: JSON.stringify(body),
        })
        const data = await res.json()
        if (data.success) {
            await Promise.all([fetchRelations(), fetchGraph()])
            return data.relation
        }
        throw new Error(data.error || 'Failed to create relation')
    }, [userId, fetchRelations, fetchGraph])

    const updateRelation = useCallback(async (id: string, body: Partial<HostRelation>) => {
        const res = await fetch(`${apiBase()}/${id}`, {
            method: 'PUT',
            headers: gatewayHeaders(userId),
            body: JSON.stringify(body),
        })
        const data = await res.json()
        if (data.success) {
            await fetchRelations()
            return data.relation
        }
        throw new Error(data.error || 'Failed to update relation')
    }, [userId, fetchRelations])

    const deleteRelation = useCallback(async (id: string) => {
        const res = await fetch(`${apiBase()}/${id}`, {
            method: 'DELETE',
            headers: gatewayHeaders(userId),
        })
        const data = await res.json()
        if (data.success) {
            await fetchRelations()
            return true
        }
        throw new Error(data.error || 'Failed to delete relation')
    }, [userId, fetchRelations])

    return {
        relations, graphData, loading,
        fetchRelations, fetchGraph,
        createRelation, updateRelation, deleteRelation,
    }
}
