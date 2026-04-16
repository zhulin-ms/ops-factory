import { useState, useEffect, useCallback } from 'react'
import { GATEWAY_URL, gatewayHeaders } from '../../../../config/runtime'
import { useUser } from '../../../platform/providers/UserContext'
import type { BusinessType } from '../../../../types/host'

function apiBase() { return `${GATEWAY_URL}/business-types` }

export function useBusinessTypes() {
    const { userId } = useUser()
    const [businessTypes, setBusinessTypes] = useState<BusinessType[]>([])
    const [loading, setLoading] = useState(false)

    const fetchBusinessTypes = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch(apiBase(), { headers: gatewayHeaders(userId) })
            const data = await res.json()
            setBusinessTypes(data.businessTypes || [])
        } catch (err) {
            console.error('Failed to fetch business types', err)
        } finally {
            setLoading(false)
        }
    }, [userId])

    useEffect(() => { fetchBusinessTypes() }, [fetchBusinessTypes])

    const createBusinessType = useCallback(async (body: Partial<BusinessType>) => {
        const res = await fetch(apiBase(), {
            method: 'POST',
            headers: gatewayHeaders(userId),
            body: JSON.stringify(body),
        })
        const data = await res.json()
        if (data.success) {
            await fetchBusinessTypes()
            return data.businessType
        }
        throw new Error(data.error || 'Failed to create business type')
    }, [userId, fetchBusinessTypes])

    const updateBusinessType = useCallback(async (id: string, body: Partial<BusinessType>) => {
        const res = await fetch(`${apiBase()}/${id}`, {
            method: 'PUT',
            headers: gatewayHeaders(userId),
            body: JSON.stringify(body),
        })
        const data = await res.json()
        if (data.success) {
            await fetchBusinessTypes()
            return data.businessType
        }
        throw new Error(data.error || 'Failed to update business type')
    }, [userId, fetchBusinessTypes])

    const deleteBusinessType = useCallback(async (id: string) => {
        const res = await fetch(`${apiBase()}/${id}`, {
            method: 'DELETE',
            headers: gatewayHeaders(userId),
        })
        const data = await res.json()
        if (data.success) {
            await fetchBusinessTypes()
            return true
        }
        throw new Error(data.error || 'Failed to delete business type')
    }, [userId, fetchBusinessTypes])

    return { businessTypes, loading, fetchBusinessTypes, createBusinessType, updateBusinessType, deleteBusinessType }
}
