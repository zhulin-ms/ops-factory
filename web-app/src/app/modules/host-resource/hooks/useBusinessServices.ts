import { useState, useEffect, useCallback } from 'react'
import { GATEWAY_URL, gatewayHeaders } from '../../../../config/runtime'
import { useUser } from '../../../platform/providers/UserContext'
import type { BusinessService } from '../../../../types/host'

function apiBase() { return `${GATEWAY_URL}/business-services` }

export function useBusinessServices() {
    const { userId } = useUser()
    const [businessServices, setBusinessServices] = useState<BusinessService[]>([])
    const [loading, setLoading] = useState(false)

    const fetchBusinessServices = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(apiBase(), { headers: gatewayHeaders(userId) })
            const data = await res.json()
            setBusinessServices(
                (data.businessServices || []).map((bs: any) => ({
                    ...bs,
                    hostIds: bs.hostIds ?? [],
                    tags: bs.tags ?? [],
                }))
            )
        } catch (err) {
            console.error('Failed to fetch business services', err)
        } finally {
            setLoading(false)
        }
    }, [userId])

    useEffect(() => { fetchBusinessServices() }, [fetchBusinessServices])

    const createBusinessService = useCallback(async (body: Partial<BusinessService>) => {
        const res = await fetch(apiBase(), {
            method: 'POST',
            headers: gatewayHeaders(userId),
            body: JSON.stringify(body),
        })
        const data = await res.json()
        if (data.success) {
            await fetchBusinessServices()
            return data.businessService
        }
        throw new Error(data.error || 'Failed to create business service')
    }, [userId, fetchBusinessServices])

    const updateBusinessService = useCallback(async (id: string, body: Partial<BusinessService>) => {
        const res = await fetch(`${apiBase()}/${id}`, {
            method: 'PUT',
            headers: gatewayHeaders(userId),
            body: JSON.stringify(body),
        })
        const data = await res.json()
        if (data.success) {
            await fetchBusinessServices()
            return data.businessService
        }
        throw new Error(data.error || 'Failed to update business service')
    }, [userId, fetchBusinessServices])

    const deleteBusinessService = useCallback(async (id: string) => {
        const res = await fetch(`${apiBase()}/${id}`, {
            method: 'DELETE',
            headers: gatewayHeaders(userId),
        })
        const data = await res.json()
        if (data.success) {
            await fetchBusinessServices()
            return true
        }
        throw new Error(data.error || 'Failed to delete business service')
    }, [userId, fetchBusinessServices])

    return { businessServices, loading, fetchBusinessServices, createBusinessService, updateBusinessService, deleteBusinessService }
}
