import { useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  McpEntry,
  McpResponse,
  McpAddRequest,
  CategorizedMcpEntries,
} from '../../../../types/mcp'
import { categorizeMcpEntries } from '../../../../types/mcp'
import { GATEWAY_URL, gatewayHeaders } from '../../../../config/runtime'
import { getErrorMessage } from '../../../../utils/errorMessages'
import { useToast } from '../../../platform/providers/ToastContext'
import { useUser } from '../../../platform/providers/UserContext'

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
  const { t } = useTranslation()
  const { showToast } = useToast()
  const { userId } = useUser()
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
        headers: gatewayHeaders(userId),
        signal: AbortSignal.timeout(10000),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      }

      const data: McpResponse = await res.json()
      setEntries(data.extensions || [])
      setWarnings(data.warnings || [])
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }, [agentId, userId])

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
      // Extract config from entry (everything except enabled)
      const { enabled: _currentEnabled, ...config } = entry

      const res = await fetch(`${GATEWAY_URL}/agents/${agentId}/mcp`, {
        method: 'POST',
        headers: gatewayHeaders(userId),
        body: JSON.stringify({
          name: entry.name,
          enabled,
          config,
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
      showToast('success', t('mcp.configUpdatedRestarting'))
    } catch (err) {
      setError(getErrorMessage(err))
      // Refresh to get actual state
      await fetchMcp()
    }
  }, [agentId, userId, entries, fetchMcp])

  const addMcp = useCallback(async (request: McpAddRequest) => {
    if (!agentId) return

    setError(null)

    try {
      const { enabled, ...config } = request

      const res = await fetch(`${GATEWAY_URL}/agents/${agentId}/mcp`, {
        method: 'POST',
        headers: gatewayHeaders(userId),
        body: JSON.stringify({
          name: request.name,
          enabled,
          config,
        }),
        signal: AbortSignal.timeout(10000),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      }

      // Refresh to get updated list
      await fetchMcp()
    } catch (err) {
      setError(getErrorMessage(err))
      throw err
    }
  }, [agentId, userId, fetchMcp])

  const deleteMcp = useCallback(async (name: string) => {
    if (!agentId) return

    setError(null)

    try {
      const res = await fetch(`${GATEWAY_URL}/agents/${agentId}/mcp/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: gatewayHeaders(userId),
        signal: AbortSignal.timeout(10000),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      }

      // Remove from local state
      setEntries(prev => prev.filter(e => e.name !== name))
      showToast('success', t('mcp.configUpdatedRestarting'))
    } catch (err) {
      setError(getErrorMessage(err))
      // Refresh to get actual state
      await fetchMcp()
    }
  }, [agentId, userId, fetchMcp])

  const categorized = useMemo(() => categorizeMcpEntries(entries), [entries])

  return {
    entries,
    categorized,
    warnings,
    isLoading,
    error,
    fetchMcp,
    toggleMcp,
    addMcp,
    deleteMcp,
  }
}
