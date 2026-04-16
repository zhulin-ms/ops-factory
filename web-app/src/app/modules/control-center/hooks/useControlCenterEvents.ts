import { useCallback, useEffect, useRef, useState } from 'react'
import { CONTROL_CENTER_URL, controlCenterHeaders } from '../../../../config/runtime'
import { getErrorMessage } from '../../../../utils/errorMessages'

export interface ControlCenterEvent {
    timestamp: number
    type: string
    serviceId: string
    serviceName: string
    level: 'info' | 'warning' | 'error'
    message: string
}

export function useControlCenterEvents(autoRefreshMs = 15_000) {
    const [events, setEvents] = useState<ControlCenterEvent[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const fetchIdRef = useRef(0)

    const load = useCallback(async (signal?: AbortSignal) => {
        const id = ++fetchIdRef.current
        setIsLoading(true)
        setError(null)
        try {
            const response = await fetch(`${CONTROL_CENTER_URL}/events`, {
                headers: controlCenterHeaders(),
                signal: signal || AbortSignal.timeout(10_000),
            })
            if (!response.ok) {
                const text = await response.text().catch(() => '')
                throw new Error(`HTTP ${response.status}: ${text}`)
            }
            const json = await response.json() as { events?: ControlCenterEvent[] }
            if (id !== fetchIdRef.current) return
            setEvents(json.events || [])
        } catch (loadError) {
            if (id !== fetchIdRef.current) return
            if (loadError instanceof DOMException && loadError.name === 'AbortError') return
            setError(getErrorMessage(loadError))
        } finally {
            if (id === fetchIdRef.current) setIsLoading(false)
        }
    }, [])

    const refresh = useCallback(() => { load() }, [load])

    useEffect(() => {
        const controller = new AbortController()
        load(controller.signal)
        const interval = setInterval(() => {
            if (!document.hidden) load()
        }, autoRefreshMs)
        return () => {
            controller.abort()
            clearInterval(interval)
        }
    }, [load, autoRefreshMs])

    return { events, isLoading, error, refresh }
}
