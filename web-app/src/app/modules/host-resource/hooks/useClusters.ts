import { useState, useEffect, useCallback } from 'react'
import { GATEWAY_URL, gatewayHeaders } from '../../../../config/runtime'
import { useUser } from '../../../platform/providers/UserContext'
import type { Cluster } from '../../../../types/host'

function apiBase() { return `${GATEWAY_URL}/clusters` }

export function useClusters(groupId?: string, type?: string) {
    const { userId } = useUser()
    const [clusters, setClusters] = useState<Cluster[]>([])
    const [clusterTypes, setClusterTypes] = useState<string[]>([])
    const [loading, setLoading] = useState(false)

    const fetchClusters = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (groupId) params.set('groupId', groupId)
            if (type) params.set('type', type)
            const qs = params.toString()
            const res = await fetch(`${apiBase()}${qs ? '?' + qs : ''}`, { headers: gatewayHeaders(userId) })
            const data = await res.json()
            setClusters(data.clusters || [])
        } catch (err) {
            console.error('Failed to fetch clusters', err)
        } finally {
            setLoading(false)
        }
    }, [groupId, type, userId])

    const fetchAllClusters = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(apiBase(), { headers: gatewayHeaders(userId) })
            const data = await res.json()
            setClusters(data.clusters || [])
        } catch (err) {
            console.error('Failed to fetch all clusters', err)
        } finally {
            setLoading(false)
        }
    }, [userId])

    const fetchClusterTypes = useCallback(async () => {
        try {
            const res = await fetch(`${apiBase()}/types`, { headers: gatewayHeaders(userId) })
            const data = await res.json()
            setClusterTypes(data.types || [])
        } catch (err) {
            console.error('Failed to fetch cluster types', err)
        }
    }, [userId])

    useEffect(() => { fetchClusterTypes() }, [fetchClusterTypes])

    const createCluster = useCallback(async (body: Partial<Cluster>) => {
        const res = await fetch(apiBase(), {
            method: 'POST',
            headers: gatewayHeaders(userId),
            body: JSON.stringify(body),
        })
        const data = await res.json()
        if (data.success) {
            await fetchAllClusters()
            return data.cluster
        }
        throw new Error(data.error || 'Failed to create cluster')
    }, [userId, fetchAllClusters])

    const updateCluster = useCallback(async (id: string, body: Partial<Cluster>) => {
        const res = await fetch(`${apiBase()}/${id}`, {
            method: 'PUT',
            headers: gatewayHeaders(userId),
            body: JSON.stringify(body),
        })
        const data = await res.json()
        if (data.success) {
            await fetchAllClusters()
            return data.cluster
        }
        throw new Error(data.error || 'Failed to update cluster')
    }, [userId, fetchAllClusters])

    const deleteCluster = useCallback(async (id: string) => {
        const res = await fetch(`${apiBase()}/${id}`, {
            method: 'DELETE',
            headers: gatewayHeaders(userId),
        })
        const data = await res.json()
        if (data.success) {
            await fetchAllClusters()
            return true
        }
        throw new Error(data.error || 'Failed to delete cluster')
    }, [userId, fetchAllClusters])

    return {
        clusters, clusterTypes, loading,
        fetchClusters, fetchAllClusters, fetchClusterTypes,
        createCluster, updateCluster, deleteCluster,
    }
}
