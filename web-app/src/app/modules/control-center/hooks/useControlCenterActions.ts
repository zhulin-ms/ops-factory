import { useCallback, useState } from 'react'
import { CONTROL_CENTER_URL, controlCenterHeaders } from '../../../../config/runtime'
import { getErrorMessage } from '../../../../utils/errorMessages'

export type ControlCenterAction = 'probe' | 'restart' | 'start' | 'stop'

export interface ServiceActionResult {
    serviceId: string
    action: string
    success: boolean
    startedAt: number
    finishedAt: number
    exitCode: number
    message: string
}

export function useControlCenterActions() {
    const [pendingServiceId, setPendingServiceId] = useState<string | null>(null)
    const [pendingAction, setPendingAction] = useState<ControlCenterAction | null>(null)

    const runAction = useCallback(async (serviceId: string, action: ControlCenterAction): Promise<ServiceActionResult | Record<string, unknown>> => {
        setPendingServiceId(serviceId)
        setPendingAction(action)
        try {
            const response = await fetch(`${CONTROL_CENTER_URL}/services/${serviceId}/actions/${action}`, {
                method: 'POST',
                headers: controlCenterHeaders(),
                signal: AbortSignal.timeout(30_000),
            })
            if (!response.ok) {
                const text = await response.text().catch(() => '')
                throw new Error(`HTTP ${response.status}: ${text}`)
            }
            return await response.json()
        } catch (error) {
            throw new Error(getErrorMessage(error))
        } finally {
            setPendingServiceId(null)
            setPendingAction(null)
        }
    }, [])

    return {
        runAction,
        pendingServiceId,
        pendingAction,
        isPending: pendingServiceId !== null,
    }
}
