import { useState, useCallback } from 'react'
import type { McpEntry, McpResponse, McpAddRequest, CategorizedMcpEntries } from '../types/mcp'
import { categorizeMcpEntries } from '../types/mcp'

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'http://127.0.0.1:3000'
const GATEWAY_SECRET_KEY = import.meta.env.VITE_GATEWAY_SECRET_KEY || 'test'

interface UseMcpResult {
  entries: McpEntry[]
  categorized: CategorizedMcpEntries
  warnings: string[]
  isLoading: boolean
  error: string | null
  fetchMcp: () => Promise<void>
  toggleMcp: (name: string, enabled: boolean) => Promise<void>
  addMcp: (request: McpAddRequest) => Promise<void>
  deleteMcp: (name: string) => Promise<void>
}

export function useMcp(agentId: string | null): UseMcpResult {
  const [entries, setEntries] = useState<McpEntry[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchMcp = useCallback(async () => {
    if (!agentId) return

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(`${GATEWAY_URL}/agents/${agentId}/mcp`, {
        headers: { 'x-secret-key': GATEWAY_SECRET_KEY },
        signal: AbortSignal.timeout(10000),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      }

      const data: McpResponse = await res.json()
      setEntries(data.extensions || [])
      setWarnings(data.warnings || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch MCP config')
    } finally {
      setIsLoading(false)
    }
  }, [agentId])

  const toggleMcp = useCallback(async (name: string, enabled: boolean) => {
    if (!agentId) return

    // Find current entry
    const entry = entries.find(e => e.name === name)
    if (!entry) {
      setError(`MCP "${name}" not found`)
      return
    }

    setError(null)

    try {
      const res = await fetch(`${GATEWAY_URL}/agents/${agentId}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-secret-key': GATEWAY_SECRET_KEY,
        },
        body: JSON.stringify({
          ...entry,
          enabled,
        }),
        signal: AbortSignal.timeout(10000),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      }

      // Optimistic update
      setEntries(prev =>
        prev.map(e =>
          e.name === name ? { ...e, enabled } : e
        )
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle MCP')
      // Refresh to get actual state
      await fetchMcp()
    }
  }, [agentId, entries, fetchMcp])

  const addMcp = useCallback(async (request: McpAddRequest) => {
    if (!agentId) return

    setError(null)

    try {
      const res = await fetch(`${GATEWAY_URL}/agents/${agentId}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-secret-key': GATEWAY_SECRET_KEY,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(10000),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      }

      // Refresh to get updated list
      await fetchMcp()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add MCP')
      throw err
    }
  }, [agentId, fetchMcp])

  const deleteMcp = useCallback(async (name: string) => {
    if (!agentId) return

    setError(null)

    try {
      const res = await fetch(`${GATEWAY_URL}/agents/${agentId}/mcp/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: { 'x-secret-key': GATEWAY_SECRET_KEY },
        signal: AbortSignal.timeout(10000),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      }

      // Remove from local state
      setEntries(prev => prev.filter(e => e.name !== name))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete MCP')
      // Refresh to get actual state
      await fetchMcp()
    }
  }, [agentId, fetchMcp])

  return {
    entries,
    categorized: categorizeMcpEntries(entries),
    warnings,
    isLoading,
    error,
    fetchMcp,
    toggleMcp,
    addMcp,
    deleteMcp,
  }
}
