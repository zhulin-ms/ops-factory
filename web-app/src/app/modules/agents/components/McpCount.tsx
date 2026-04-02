import { useEffect } from 'react'
import { useMcp } from '../../../../hooks/useMcp'

export function McpCount({ agentId }: { agentId: string }) {
    const { entries, fetchMcp } = useMcp(agentId)

    useEffect(() => {
        fetchMcp()
    }, [fetchMcp])

    const enabledCount = entries.filter((entry) => entry.enabled).length
    return <span>{enabledCount}</span>
}

