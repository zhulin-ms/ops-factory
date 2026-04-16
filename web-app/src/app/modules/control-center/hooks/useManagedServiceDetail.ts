import { useCallback, useState } from 'react'
import { CONTROL_CENTER_URL, controlCenterHeaders } from '../../../../config/runtime'
import { getErrorMessage } from '../../../../utils/errorMessages'

export interface ManagedServiceConfigResponse {
    serviceId: string
    serviceName: string
    path: string
    content: string
}

export interface ManagedServiceLogsResponse {
    serviceId: string
    serviceName: string
    path: string
    lines: number
    content: string
}

export function useManagedServiceDetail() {
    const [config, setConfig] = useState<ManagedServiceConfigResponse | null>(null)
    const [logs, setLogs] = useState<ManagedServiceLogsResponse | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchConfig = useCallback(async (serviceId: string) => {
        const response = await fetch(`${CONTROL_CENTER_URL}/services/${serviceId}/config`, {
            headers: controlCenterHeaders(),
            signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) {
            const text = await response.text().catch(() => '')
            throw new Error(`HTTP ${response.status}: ${text}`)
        }
        const data = await response.json() as ManagedServiceConfigResponse
        setConfig(data)
        return data
    }, [])

    const fetchLogs = useCallback(async (serviceId: string, lines = 200) => {
        const response = await fetch(`${CONTROL_CENTER_URL}/services/${serviceId}/logs?lines=${lines}`, {
            headers: controlCenterHeaders(),
            signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) {
            const text = await response.text().catch(() => '')
            throw new Error(`HTTP ${response.status}: ${text}`)
        }
        const data = await response.json() as ManagedServiceLogsResponse
        setLogs(data)
        return data
    }, [])

    const load = useCallback(async (serviceId: string) => {
        setIsLoading(true)
        setError(null)
        try {
            await Promise.all([fetchConfig(serviceId), fetchLogs(serviceId)])
        } catch (loadError) {
            setError(getErrorMessage(loadError))
        } finally {
            setIsLoading(false)
        }
    }, [fetchConfig, fetchLogs])

    const saveConfig = useCallback(async (serviceId: string, content: string) => {
        setIsSaving(true)
        setError(null)
        try {
            const response = await fetch(`${CONTROL_CENTER_URL}/services/${serviceId}/config`, {
                method: 'PUT',
                headers: controlCenterHeaders(),
                body: JSON.stringify({ content }),
                signal: AbortSignal.timeout(10_000),
            })
            if (!response.ok) {
                const text = await response.text().catch(() => '')
                throw new Error(`HTTP ${response.status}: ${text}`)
            }
            await fetchConfig(serviceId)
            return { success: true as const }
        } catch (saveError) {
            const message = getErrorMessage(saveError)
            setError(message)
            return { success: false as const, error: message }
        } finally {
            setIsSaving(false)
        }
    }, [fetchConfig])

    return {
        config,
        logs,
        isLoading,
        isSaving,
        error,
        load,
        fetchLogs,
        saveConfig,
    }
}
