function randomSegment() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }

    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function createScopedId(scope: string) {
    return `${scope}_${randomSegment()}`
}

export function createPageViewId() {
    return createScopedId('pv')
}

export function createInteractionId() {
    return createScopedId('ix')
}

export function createRequestId() {
    return createScopedId('req')
}

export function createStreamId() {
    return createScopedId('stream')
}
