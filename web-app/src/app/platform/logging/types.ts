export type FrontendLogLevel = 'debug' | 'info' | 'warn' | 'error'

export type FrontendLogCategory =
    | 'app'
    | 'route'
    | 'request'
    | 'data'
    | 'mutation'
    | 'stream'
    | 'asset'
    | 'error'

export type FrontendLogResult =
    | 'start'
    | 'success'
    | 'fail'
    | 'cancel'
    | 'partial_success'
    | 'degraded'

export interface FrontendLogEvent {
    ts: string
    level: FrontendLogLevel
    category: FrontendLogCategory
    name: string
    result?: FrontendLogResult
    pageViewId?: string
    interactionId?: string
    requestId?: string
    streamId?: string
    routeId?: string
    moduleId?: string
    intent?: string
    targetType?: string
    targetId?: string
    userId?: string
    agentId?: string
    sessionId?: string
    sourceId?: string
    documentId?: string
    scheduleId?: string
    jobId?: string
    method?: string
    path?: string
    status?: number
    durationMs?: number
    errorCode?: string
    errorMessage?: string
    extra?: Record<string, unknown>
}

export type FrontendLogPayload = Omit<FrontendLogEvent, 'ts' | 'level'>
