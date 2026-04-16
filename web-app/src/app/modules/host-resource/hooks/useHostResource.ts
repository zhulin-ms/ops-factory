import { useState, useCallback } from 'react'
import { GATEWAY_URL, gatewayHeaders } from '../../../../config/runtime'
import { useUser } from '../../../platform/providers/UserContext'
import type { Host, HostCreateRequest, DiscoveryPlan, DiscoveryCommand, HostDiscoveryResult } from '../../../../types/host'

function apiBase() { return `${GATEWAY_URL}/hosts` }

export function useHostResource() {
    const { userId } = useUser()
    const [hosts, setHosts] = useState<Host[]>([])
    const [allHosts, setAllHosts] = useState<Host[]>([])
    const [loading, setLoading] = useState(false)

    const fetchHosts = useCallback(async (clusterId?: string, groupId?: string, businessServiceId?: string) => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (businessServiceId) params.set('businessServiceId', businessServiceId)
            else if (clusterId) params.set('clusterId', clusterId)
            else if (groupId) params.set('groupId', groupId)
            const qs = params.toString()
            const res = await fetch(`${apiBase()}${qs ? '?' + qs : ''}`, { headers: gatewayHeaders(userId) })
            const data = await res.json()
            setHosts(data.hosts || [])
        } catch (err) {
            console.error('Failed to fetch hosts', err)
        } finally {
            setLoading(false)
        }
    }, [userId])

    const fetchAllHosts = useCallback(async () => {
        try {
            const res = await fetch(`${apiBase()}`, { headers: gatewayHeaders(userId) })
            const data = await res.json()
            setAllHosts(data.hosts || [])
        } catch (err) {
            console.error('Failed to fetch all hosts', err)
        }
    }, [userId])

    const createHost = useCallback(async (body: HostCreateRequest) => {
        const res = await fetch(apiBase(), {
            method: 'POST',
            headers: gatewayHeaders(userId),
            body: JSON.stringify(body),
        })
        const data = await res.json()
        if (data.success) {
            await Promise.all([fetchHosts(), fetchAllHosts()])
            return data.host
        }
        throw new Error(data.error || 'Failed to create host')
    }, [userId, fetchHosts, fetchAllHosts])

    const updateHost = useCallback(async (id: string, body: Partial<Host>) => {
        const res = await fetch(`${apiBase()}/${id}`, {
            method: 'PUT',
            headers: gatewayHeaders(userId),
            body: JSON.stringify(body),
        })
        const data = await res.json()
        if (data.success) {
            await Promise.all([fetchHosts(), fetchAllHosts()])
            return data.host
        }
        throw new Error(data.error || 'Failed to update host')
    }, [userId, fetchHosts, fetchAllHosts])

    const deleteHost = useCallback(async (id: string) => {
        const res = await fetch(`${apiBase()}/${id}`, {
            method: 'DELETE',
            headers: gatewayHeaders(userId),
        })
        const data = await res.json()
        if (data.success) {
            await Promise.all([fetchHosts(), fetchAllHosts()])
            return true
        }
        throw new Error(data.error || 'Failed to delete host')
    }, [userId, fetchHosts, fetchAllHosts])

    const testConnection = useCallback(async (id: string) => {
        const res = await fetch(`${apiBase()}/${id}/test`, {
            method: 'POST',
            headers: gatewayHeaders(userId),
        })
        return res.json()
    }, [userId])

    const discoverPlan = useCallback(async (id: string): Promise<DiscoveryPlan> => {
        const res = await fetch(`${apiBase()}/${id}/discover-plan`, {
            method: 'POST',
            headers: gatewayHeaders(userId),
        })
        return res.json()
    }, [userId])

    const discoverExecute = useCallback(async (id: string, commands: DiscoveryCommand[]): Promise<HostDiscoveryResult> => {
        const res = await fetch(`${apiBase()}/${id}/discover-execute`, {
            method: 'POST',
            headers: gatewayHeaders(userId),
            body: JSON.stringify({ commands }),
        })
        return res.json()
    }, [userId])

    return { hosts, allHosts, loading, fetchHosts, fetchAllHosts, createHost, updateHost, deleteHost, testConnection, discoverPlan, discoverExecute }
}
