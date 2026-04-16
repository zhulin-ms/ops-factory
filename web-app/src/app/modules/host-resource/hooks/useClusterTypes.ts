import { useState, useEffect, useCallback } from 'react'
import { GATEWAY_URL, gatewayHeaders } from '../../../../config/runtime'
import { useUser } from '../../../platform/providers/UserContext'
import type { ClusterType } from '../../../../types/host'

function apiBase() { return `${GATEWAY_URL}/cluster-types` }

export function useClusterTypes() {
    const { userId } = useUser()
    const [clusterTypes, setClusterTypes] = useState<ClusterType[]>([])
    const [loading, setLoading] = useState(false)

    const fetchClusterTypes = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(apiBase(), { headers: gatewayHeaders(userId) })
            const data = await res.json()
            setClusterTypes(data.clusterTypes || [])
        } catch (err) {
            console.error('Failed to fetch cluster types', err)
        } finally {
            setLoading(false)
        }
    }, [userId])

    useEffect(() => { fetchClusterTypes() }, [fetchClusterTypes])

    const createClusterType = useCallback(async (body: Partial<ClusterType>) => {
        const res = await fetch(apiBase(), {
            method: 'POST',
            headers: gatewayHeaders(userId),
            body: JSON.stringify(body),
        })
        const data = await res.json()
        if (data.success) {
            await fetchClusterTypes()
            return data.clusterType
        }
        throw new Error(data.error || 'Failed to create cluster type')
    }, [userId, fetchClusterTypes])

    const updateClusterType = useCallback(async (id: string, body: Partial<ClusterType>) => {
        const res = await fetch(`${apiBase()}/${id}`, {
            method: 'PUT',
            headers: gatewayHeaders(userId),
            body: JSON.stringify(body),
        })
        const data = await res.json()
        if (data.success) {
            await fetchClusterTypes()
            return data.clusterType
        }
        throw new Error(data.error || 'Failed to update cluster type')
    }, [userId, fetchClusterTypes])

    const deleteClusterType = useCallback(async (id: string) => {
        const res = await fetch(`${apiBase()}/${id}`, {
            method: 'DELETE',
            headers: gatewayHeaders(userId),
        })
        const data = await res.json()
        if (data.success) {
            await fetchClusterTypes()
            return true
        }
        throw new Error(data.error || 'Failed to delete cluster type')
    }, [userId, fetchClusterTypes])

    return { clusterTypes, loading, fetchClusterTypes, createClusterType, updateClusterType, deleteClusterType }
}
