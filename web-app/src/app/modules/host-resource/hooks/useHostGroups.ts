import { useState, useEffect, useCallback } from 'react'
import { GATEWAY_URL, gatewayHeaders } from '../../../../config/runtime'
import { useUser } from '../../../platform/providers/UserContext'
import type { HostGroup } from '../../../../types/host'

function apiBase() { return `${GATEWAY_URL}/host-groups` }

export function useHostGroups() {
    const { userId } = useUser()
    const [groups, setGroups] = useState<HostGroup[]>([])
    const [loading, setLoading] = useState(false)

    const fetchGroups = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(apiBase(), { headers: gatewayHeaders(userId) })
            const data = await res.json()
            setGroups(data.groups || [])
        } catch (err) {
            console.error('Failed to fetch host groups', err)
        } finally {
            setLoading(false)
        }
    }, [userId])

    useEffect(() => { fetchGroups() }, [fetchGroups])

    const createGroup = useCallback(async (body: Partial<HostGroup>) => {
        const res = await fetch(apiBase(), {
            method: 'POST',
            headers: gatewayHeaders(userId),
            body: JSON.stringify(body),
        })
        const data = await res.json()
        if (data.success) {
            await fetchGroups()
            return data.group
        }
        throw new Error(data.error || 'Failed to create group')
    }, [userId, fetchGroups])

    const updateGroup = useCallback(async (id: string, body: Partial<HostGroup>) => {
        const res = await fetch(`${apiBase()}/${id}`, {
            method: 'PUT',
            headers: gatewayHeaders(userId),
            body: JSON.stringify(body),
        })
        const data = await res.json()
        if (data.success) {
            await fetchGroups()
            return data.group
        }
        throw new Error(data.error || 'Failed to update group')
    }, [userId, fetchGroups])

    const deleteGroup = useCallback(async (id: string, force?: boolean) => {
        const params = force ? '?force=true' : ''
        const res = await fetch(`${apiBase()}/${id}${params}`, {
            method: 'DELETE',
            headers: gatewayHeaders(userId),
        })
        const data = await res.json()
        if (data.success) {
            await fetchGroups()
            return true
        }
        const err = new Error(data.error || 'Failed to delete group')
        ;(err as any).status = res.status
        throw err
    }, [userId, fetchGroups])

    const fetchTree = useCallback(async () => {
        const res = await fetch(`${apiBase()}/tree`, { headers: gatewayHeaders(userId) })
        return res.json()
    }, [userId])

    return { groups, loading, fetchGroups, createGroup, updateGroup, deleteGroup, fetchTree }
}
