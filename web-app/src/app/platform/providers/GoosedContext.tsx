import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react'
import { GoosedClient } from '@goosed/sdk'
import { useUser } from './UserContext'
import { GATEWAY_URL, GATEWAY_SECRET_KEY } from '../../../config/runtime'
import { getErrorMessage } from '../../../utils/errorMessages'
import { trackedFetch } from '../logging/requestClient'

export interface AgentInfo {
    id: string
    name: string
    status: string
    provider?: string
    model?: string
    skills: string[]
}

interface GoosedContextType {
    getClient: (agentId: string) => GoosedClient
    agents: AgentInfo[]
    isConnected: boolean
    error: string | null
    refreshAgents: () => Promise<void>
}

const GoosedContext = createContext<GoosedContextType | null>(null)

export function GoosedProvider({ children }: { children: ReactNode }) {
    const { userId } = useUser()
    const [agents, setAgents] = useState<AgentInfo[]>([])
    const [isConnected, setIsConnected] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const clientCache = useRef<Record<string, GoosedClient>>({})
    const lastUserId = useRef<string | null>(null)

    // Clear client cache when userId changes
    if (lastUserId.current !== userId) {
        clientCache.current = {}
        lastUserId.current = userId
    }

    const getClient = useCallback((agentId: string): GoosedClient => {
        const cacheKey = `${agentId}:${userId || ''}`
        if (!clientCache.current[cacheKey]) {
            clientCache.current[cacheKey] = new GoosedClient({
                baseUrl: `${GATEWAY_URL}/agents/${agentId}`,
                secretKey: GATEWAY_SECRET_KEY,
                timeout: 3 * 60 * 1000, // 3 minutes — gateway SSE timeouts handle earlier detection
                userId: userId || undefined,
            })
        }
        return clientCache.current[cacheKey]
    }, [userId])

    const fetchAgents = useCallback(async () => {
        try {
            const headers: Record<string, string> = { 'x-secret-key': GATEWAY_SECRET_KEY }
            if (userId) headers['x-user-id'] = userId
            const res = await trackedFetch(`${GATEWAY_URL}/agents`, {
                category: 'data',
                name: 'data.load',
                headers,
                signal: AbortSignal.timeout(30000),
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json()
            setAgents(data.agents || [])
            setIsConnected(true)
            setError(null)
        } catch (err) {
            setIsConnected(false)
            setError(getErrorMessage(err))
        }
    }, [userId])

    useEffect(() => {
        fetchAgents()
    }, [fetchAgents])

    return (
        <GoosedContext.Provider value={{ getClient, agents, isConnected, error, refreshAgents: fetchAgents }}>
            {children}
        </GoosedContext.Provider>
    )
}

export function useGoosed(): GoosedContextType {
    const context = useContext(GoosedContext)
    if (!context) {
        throw new Error('useGoosed must be used within a GoosedProvider')
    }
    return context
}
