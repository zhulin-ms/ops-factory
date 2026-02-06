import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react'
import { GoosedClient } from '@goosed/sdk'

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'http://127.0.0.1:3000'
const GATEWAY_SECRET_KEY = import.meta.env.VITE_GATEWAY_SECRET_KEY || 'test'

export interface AgentInfo {
    id: string
    name: string
    status: string
    working_dir: string
    port: number
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
    const [agents, setAgents] = useState<AgentInfo[]>([])
    const [isConnected, setIsConnected] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const clientCache = useRef<Record<string, GoosedClient>>({})

    const getClient = useCallback((agentId: string): GoosedClient => {
        if (!clientCache.current[agentId]) {
            clientCache.current[agentId] = new GoosedClient({
                baseUrl: `${GATEWAY_URL}/agents/${agentId}`,
                secretKey: GATEWAY_SECRET_KEY,
                timeout: 5 * 60 * 1000, // 5 minutes for LLM responses
            })
        }
        return clientCache.current[agentId]
    }, [])

    const fetchAgents = useCallback(async () => {
        try {
            const res = await fetch(`${GATEWAY_URL}/agents`, {
                headers: { 'x-secret-key': GATEWAY_SECRET_KEY },
                signal: AbortSignal.timeout(5000),
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json()
            setAgents(data.agents || [])
            setIsConnected(true)
            setError(null)
        } catch (err) {
            setIsConnected(false)
            setError(err instanceof Error ? err.message : 'Failed to connect to gateway')
        }
    }, [])

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
