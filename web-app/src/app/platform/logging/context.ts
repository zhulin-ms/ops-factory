import type { FrontendLogEvent } from './types'

type FrontendLoggingContext = Partial<Pick<
    FrontendLogEvent,
    'pageViewId' | 'routeId' | 'moduleId' | 'userId'
>>

const contextState: FrontendLoggingContext = {}

export function getLoggingContext(): FrontendLoggingContext {
    return { ...contextState }
}

export function updateLoggingContext(next: FrontendLoggingContext) {
    for (const [key, value] of Object.entries(next) as Array<[keyof FrontendLoggingContext, string | undefined]>) {
        if (value === undefined || value === null || value === '') {
            delete contextState[key]
            continue
        }
        contextState[key] = value
    }
}

export function clearLoggingContext(keys: Array<keyof FrontendLoggingContext>) {
    for (const key of keys) {
        delete contextState[key]
    }
}
