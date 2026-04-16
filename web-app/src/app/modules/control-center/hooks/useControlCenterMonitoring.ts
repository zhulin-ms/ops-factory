import { useState, useCallback, useRef, useEffect } from 'react'
import { CONTROL_CENTER_URL, controlCenterHeaders } from '../../../../config/runtime'
import { getErrorMessage } from '../../../../utils/errorMessages'

// ---- Types matching control-center responses ----

export interface MonitoringStatus {
  enabled: boolean
  reachable?: boolean
  host?: string
}

export interface DailyPoint {
  date: string
  traces: number
  observations: number
  cost: number
}

export interface OverviewData {
  totalTraces: number
  totalObservations: number
  totalCost: number
  avgLatency: number
  p95Latency: number
  errorCount: number
  daily: DailyPoint[]
}

export interface TraceRow {
  id: string
  name: string
  timestamp: string
  input: string
  latency: number
  totalCost: number
  observationCount: number
  hasError: boolean
  errorMessage?: string
}

export interface ObservationGroup {
  name: string
  count: number
  avgLatency: number
  p95Latency: number
  totalTokens: number
  totalCost: number
}

export type TimeRange = '1h' | '24h' | '7d' | '30d'

function rangeToISO(range: TimeRange): { from: string; to: string } {
  const to = new Date().toISOString()
  const ms: Record<TimeRange, number> = {
    '1h': 3600_000,
    '24h': 86400_000,
    '7d': 7 * 86400_000,
    '30d': 30 * 86400_000,
  }
  const from = new Date(Date.now() - ms[range]).toISOString()
  return { from, to }
}

async function cc<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${CONTROL_CENTER_URL}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, v)
    }
  }
  const res = await fetch(url.toString(), {
    headers: controlCenterHeaders(),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

// ---- Types for platform monitoring (no Langfuse dependency) ----

export interface SystemInfo {
  gateway: {
    host: string
    port: number
    uptimeMs: number
    uptimeFormatted: string
    startedAt: string
  }
  agents: {
    configured: number
    list: Array<{ id: string; name: string }>
  }
  idle: {
    timeoutMs: number
    checkIntervalMs: number
  }
}

export interface ManagedServiceStatus {
  id: string
  name: string
  required: boolean
  status: 'healthy' | 'degraded' | 'down' | 'disabled' | 'unknown'
  reachable: boolean
  host: string
  healthPath: string
  checkedAt: number
  message?: string | null
}

export interface InstanceSnapshot {
  agentId: string
  userId: string
  port: number
  status: 'starting' | 'running' | 'stopped' | 'error'
  lastActivity: number
  runtimeRoot: string
  idleSinceMs: number
}

export interface InstancesData {
  totalInstances: number
  runningInstances: number
  byAgent: Array<{
    agentId: string
    agentName: string
    instances: InstanceSnapshot[]
  }>
}

export interface AgentInfo {
  id: string
  name: string
  status: string
  provider: string
  model: string
  skills: string[]
}

export interface UseMonitoringResult {
  status: MonitoringStatus | null
  overview: OverviewData | null
  traces: TraceRow[]
  observations: { observations: ObservationGroup[] } | null
  agents: AgentInfo[]
  isLoading: boolean
  error: string | null
  range: TimeRange
  setRange: (r: TimeRange) => void
  refresh: () => void
}

export function useMonitoring(): UseMonitoringResult {
  const [status, setStatus] = useState<MonitoringStatus | null>(null)
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [traces, setTraces] = useState<TraceRow[]>([])
  const [observations, setObservations] = useState<{ observations: ObservationGroup[] } | null>(null)
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [range, setRangeState] = useState<TimeRange>('24h')
  const fetchIdRef = useRef(0)

  const load = useCallback(async (r: TimeRange) => {
    const id = ++fetchIdRef.current
    setIsLoading(true)
    setError(null)

    try {
      // Step 1: check status
      const st = await cc<MonitoringStatus>('/observability/status')
      if (id !== fetchIdRef.current) return
      setStatus(st)

      if (!st.enabled || !st.reachable) {
        setIsLoading(false)
        return
      }

      // Step 2: fetch all data in parallel
      const { from, to } = rangeToISO(r)
      const params = { from, to }

      const [ov, tr, obs, ag] = await Promise.all([
        cc<OverviewData>('/observability/overview', params),
        cc<TraceRow[]>('/observability/traces', { ...params, limit: '30' }),
        cc<{ observations: ObservationGroup[] }>('/observability/observations', params),
        cc<{ agents: AgentInfo[] }>('/runtime/agents'),
      ])

      if (id !== fetchIdRef.current) return
      setOverview(ov)
      setTraces(tr)
      setObservations(obs)
      setAgents(ag.agents || [])
    } catch (err) {
      if (id !== fetchIdRef.current) return
      setError(getErrorMessage(err))
    } finally {
      if (id === fetchIdRef.current) setIsLoading(false)
    }
  }, [])

  // Keep a ref so refresh is stable (doesn't change when range changes)
  const rangeRef = useRef(range)
  rangeRef.current = range

  const setRange = useCallback((r: TimeRange) => {
    setRangeState(r)
    load(r)
  }, [load])

  const refresh = useCallback(() => {
    load(rangeRef.current)
  }, [load])

  // Initial load on mount
  useEffect(() => { load('24h') }, [load])

  return { status, overview, traces, observations, agents, isLoading, error, range, setRange, refresh }
}

// ---- Platform monitoring hook (gateway health + instances, no Langfuse) ----

export interface UseMonitoringPlatformResult {
  system: SystemInfo | null
  instances: InstancesData | null
  agents: AgentInfo[]
  services: ManagedServiceStatus[]
  isLoading: boolean
  error: string | null
  runtimeError: string | null
  refresh: () => void
}

export function useMonitoringPlatform(): UseMonitoringPlatformResult {
  const [system, setSystem] = useState<SystemInfo | null>(null)
  const [instances, setInstances] = useState<InstancesData | null>(null)
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [services, setServices] = useState<ManagedServiceStatus[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const fetchIdRef = useRef(0)

  const load = useCallback(async () => {
    const id = ++fetchIdRef.current
    setIsLoading(true)
    setError(null)
    setRuntimeError(null)

    try {
      const [svc, sys, inst, ag] = await Promise.allSettled([
        cc<{ services: ManagedServiceStatus[] }>('/services'),
        cc<SystemInfo>('/runtime/system'),
        cc<InstancesData>('/runtime/instances'),
        cc<{ agents: AgentInfo[] }>('/runtime/agents'),
      ])
      if (id !== fetchIdRef.current) return

      if (svc.status === 'fulfilled') {
        setServices(svc.value.services || [])
      } else {
        setServices([])
        setError(getErrorMessage(svc.reason))
      }

      const runtimeFailures: string[] = []

      if (sys.status === 'fulfilled') {
        setSystem(sys.value)
      } else {
        setSystem(null)
        runtimeFailures.push(getErrorMessage(sys.reason))
      }

      if (inst.status === 'fulfilled') {
        setInstances(inst.value)
      } else {
        setInstances(null)
        runtimeFailures.push(getErrorMessage(inst.reason))
      }

      if (ag.status === 'fulfilled') {
        setAgents(ag.value.agents || [])
      } else {
        setAgents([])
        runtimeFailures.push(getErrorMessage(ag.reason))
      }

      setRuntimeError(runtimeFailures.length > 0 ? runtimeFailures[0] : null)
    } catch (err) {
      if (id !== fetchIdRef.current) return
      setError(getErrorMessage(err))
    } finally {
      if (id === fetchIdRef.current) setIsLoading(false)
    }
  }, [])

  const refresh = useCallback(() => { load() }, [load])

  useEffect(() => { load() }, [load])

  return { system, instances, agents, services, isLoading, error, runtimeError, refresh }
}
