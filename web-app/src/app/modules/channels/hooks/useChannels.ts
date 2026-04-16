import { useCallback, useState } from 'react'
import { GATEWAY_URL, gatewayHeaders } from '../../../../config/runtime'
import { getErrorMessage } from '../../../../utils/errorMessages'
import { useUser } from '../../../platform/providers/UserContext'
import type {
    ChannelDetail,
    ChannelLoginState,
    ChannelMutationResponse,
    ChannelSelfTestResult,
    ChannelSummary,
    ChannelUpsertRequest,
    ChannelVerificationResult,
} from '../../../../types/channel'

interface UseChannelsResult {
    channels: ChannelSummary[]
    channel: ChannelDetail | null
    isLoading: boolean
    isSaving: boolean
    error: string | null
    fetchChannels: () => Promise<void>
    fetchChannel: (channelId: string) => Promise<void>
    createChannel: (request: ChannelUpsertRequest) => Promise<ChannelMutationResponse>
    updateChannel: (channelId: string, request: ChannelUpsertRequest) => Promise<ChannelMutationResponse>
    deleteChannel: (channelId: string) => Promise<{ success: boolean; error?: string }>
    setChannelEnabled: (channelId: string, enabled: boolean) => Promise<ChannelMutationResponse>
    verifyChannel: (channelId: string) => Promise<{ success: boolean; verification?: ChannelVerificationResult; error?: string }>
    startLogin: (channelId: string) => Promise<{ success: boolean; state?: ChannelLoginState; error?: string }>
    fetchLoginState: (channelId: string) => Promise<{ success: boolean; state?: ChannelLoginState; error?: string }>
    logoutChannel: (channelId: string) => Promise<{ success: boolean; state?: ChannelLoginState; error?: string }>
    runSelfTest: (channelId: string, text: string) => Promise<{ success: boolean; result?: ChannelSelfTestResult; error?: string }>
}

function defaultMutationError(message: string): ChannelMutationResponse {
    return { success: false, error: message }
}

export function useChannels(): UseChannelsResult {
    const { userId } = useUser()
    const [channels, setChannels] = useState<ChannelSummary[]>([])
    const [channel, setChannel] = useState<ChannelDetail | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchChannels = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            const response = await fetch(`${GATEWAY_URL}/channels`, {
                headers: gatewayHeaders(userId),
                signal: AbortSignal.timeout(10_000),
            })
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`)
            }
            const data = await response.json() as { channels?: ChannelSummary[] }
            setChannels(data.channels ?? [])
        } catch (err) {
            setError(getErrorMessage(err))
        } finally {
            setIsLoading(false)
        }
    }, [userId])

    const fetchChannel = useCallback(async (channelId: string) => {
        setIsLoading(true)
        setError(null)
        try {
            const response = await fetch(`${GATEWAY_URL}/channels/${channelId}`, {
                headers: gatewayHeaders(userId),
                signal: AbortSignal.timeout(10_000),
            })
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`)
            }
            const data = await response.json() as ChannelDetail
            setChannel(data)
        } catch (err) {
            setError(getErrorMessage(err))
        } finally {
            setIsLoading(false)
        }
    }, [userId])

    const createChannel = useCallback(async (request: ChannelUpsertRequest): Promise<ChannelMutationResponse> => {
        setIsSaving(true)
        setError(null)
        try {
            const response = await fetch(`${GATEWAY_URL}/channels`, {
                method: 'POST',
                headers: gatewayHeaders(userId),
                body: JSON.stringify(request),
                signal: AbortSignal.timeout(10_000),
            })
            const data = await response.json() as ChannelMutationResponse
            if (!response.ok || !data.success) {
                const message = data.error || 'Failed to create channel'
                setError(message)
                return defaultMutationError(message)
            }
            if (data.channel) {
                setChannel(data.channel)
            }
            return data
        } catch (err) {
            const message = getErrorMessage(err)
            setError(message)
            return defaultMutationError(message)
        } finally {
            setIsSaving(false)
        }
    }, [userId])

    const updateChannel = useCallback(async (
        channelId: string,
        request: ChannelUpsertRequest
    ): Promise<ChannelMutationResponse> => {
        setIsSaving(true)
        setError(null)
        try {
            const response = await fetch(`${GATEWAY_URL}/channels/${channelId}`, {
                method: 'PUT',
                headers: gatewayHeaders(userId),
                body: JSON.stringify(request),
                signal: AbortSignal.timeout(10_000),
            })
            const data = await response.json() as ChannelMutationResponse
            if (!response.ok || !data.success) {
                const message = data.error || 'Failed to update channel'
                setError(message)
                return defaultMutationError(message)
            }
            if (data.channel) {
                setChannel(data.channel)
            }
            return data
        } catch (err) {
            const message = getErrorMessage(err)
            setError(message)
            return defaultMutationError(message)
        } finally {
            setIsSaving(false)
        }
    }, [userId])

    const deleteChannel = useCallback(async (channelId: string) => {
        setIsSaving(true)
        setError(null)
        try {
            const response = await fetch(`${GATEWAY_URL}/channels/${channelId}`, {
                method: 'DELETE',
                headers: gatewayHeaders(userId),
                signal: AbortSignal.timeout(10_000),
            })
            const data = await response.json() as { success: boolean; error?: string }
            if (!response.ok || !data.success) {
                const message = data.error || 'Failed to delete channel'
                setError(message)
                return { success: false, error: message }
            }
            return { success: true }
        } catch (err) {
            const message = getErrorMessage(err)
            setError(message)
            return { success: false, error: message }
        } finally {
            setIsSaving(false)
        }
    }, [userId])

    const setChannelEnabled = useCallback(async (channelId: string, enabled: boolean): Promise<ChannelMutationResponse> => {
        setIsSaving(true)
        setError(null)
        try {
            const response = await fetch(`${GATEWAY_URL}/channels/${channelId}/${enabled ? 'enable' : 'disable'}`, {
                method: 'POST',
                headers: gatewayHeaders(userId),
                signal: AbortSignal.timeout(10_000),
            })
            const data = await response.json() as ChannelMutationResponse
            if (!response.ok || !data.success) {
                const message = data.error || 'Failed to update channel status'
                setError(message)
                return defaultMutationError(message)
            }
            if (data.channel) {
                setChannel(data.channel)
            }
            return data
        } catch (err) {
            const message = getErrorMessage(err)
            setError(message)
            return defaultMutationError(message)
        } finally {
            setIsSaving(false)
        }
    }, [userId])

    const verifyChannel = useCallback(async (channelId: string) => {
        setIsSaving(true)
        setError(null)
        try {
            const response = await fetch(`${GATEWAY_URL}/channels/${channelId}/verify`, {
                method: 'POST',
                headers: gatewayHeaders(userId),
                signal: AbortSignal.timeout(10_000),
            })
            const data = await response.json() as {
                success: boolean
                verification?: ChannelVerificationResult
                error?: string
            }
            if (!response.ok) {
                const message = data.error || 'Failed to verify channel'
                setError(message)
                return { success: false, error: message }
            }
            return data
        } catch (err) {
            const message = getErrorMessage(err)
            setError(message)
            return { success: false, error: message }
        } finally {
            setIsSaving(false)
        }
    }, [userId])

    const startLogin = useCallback(async (channelId: string) => {
        setIsSaving(true)
        setError(null)
        try {
            const response = await fetch(`${GATEWAY_URL}/channels/${channelId}/login`, {
                method: 'POST',
                headers: gatewayHeaders(userId),
                signal: AbortSignal.timeout(10_000),
            })
            const data = await response.json() as { success: boolean; state?: ChannelLoginState; error?: string }
            if (!response.ok || !data.success) {
                const message = data.error || 'Failed to start login'
                setError(message)
                return { success: false, error: message }
            }
            return data
        } catch (err) {
            const message = getErrorMessage(err)
            setError(message)
            return { success: false, error: message }
        } finally {
            setIsSaving(false)
        }
    }, [userId])

    const fetchLoginState = useCallback(async (channelId: string) => {
        setIsSaving(true)
        setError(null)
        try {
            const response = await fetch(`${GATEWAY_URL}/channels/${channelId}/login-state`, {
                headers: gatewayHeaders(userId),
                signal: AbortSignal.timeout(10_000),
            })
            const data = await response.json() as { state?: ChannelLoginState; error?: string }
            if (!response.ok || !data.state) {
                const message = data.error || 'Failed to fetch login state'
                setError(message)
                return { success: false, error: message }
            }
            return { success: true, state: data.state }
        } catch (err) {
            const message = getErrorMessage(err)
            setError(message)
            return { success: false, error: message }
        } finally {
            setIsSaving(false)
        }
    }, [userId])

    const logoutChannel = useCallback(async (channelId: string) => {
        setIsSaving(true)
        setError(null)
        try {
            const response = await fetch(`${GATEWAY_URL}/channels/${channelId}/logout`, {
                method: 'POST',
                headers: gatewayHeaders(userId),
                signal: AbortSignal.timeout(10_000),
            })
            const data = await response.json() as { success: boolean; state?: ChannelLoginState; error?: string }
            if (!response.ok || !data.success) {
                const message = data.error || 'Failed to clear login state'
                setError(message)
                return { success: false, error: message }
            }
            return data
        } catch (err) {
            const message = getErrorMessage(err)
            setError(message)
            return { success: false, error: message }
        } finally {
            setIsSaving(false)
        }
    }, [userId])

    const runSelfTest = useCallback(async (channelId: string, text: string) => {
        setIsSaving(true)
        setError(null)
        try {
            const response = await fetch(`${GATEWAY_URL}/channels/${channelId}/self-test`, {
                method: 'POST',
                headers: gatewayHeaders(userId),
                body: JSON.stringify({ text }),
                signal: AbortSignal.timeout(10_000),
            })
            const data = await response.json() as { success: boolean; result?: ChannelSelfTestResult; error?: string }
            if (!response.ok || !data.success) {
                const message = data.error || 'Failed to run self-test'
                setError(message)
                return { success: false, error: message }
            }
            return data
        } catch (err) {
            const message = getErrorMessage(err)
            setError(message)
            return { success: false, error: message }
        } finally {
            setIsSaving(false)
        }
    }, [userId])

    return {
        channels,
        channel,
        isLoading,
        isSaving,
        error,
        fetchChannels,
        fetchChannel,
        createChannel,
        updateChannel,
        deleteChannel,
        setChannelEnabled,
        verifyChannel,
        startLogin,
        fetchLoginState,
        logoutChannel,
        runSelfTest,
    }
}
