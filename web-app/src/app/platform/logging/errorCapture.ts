import { logError } from './logger'

let installed = false

function normalizeErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error && error.message) {
        return error.message
    }

    if (typeof error === 'string' && error.trim()) {
        return error
    }

    return fallback
}

export function installGlobalErrorCapture() {
    if (installed || typeof window === 'undefined') {
        return
    }

    installed = true

    window.addEventListener('error', (event) => {
        logError({
            category: 'app',
            name: 'app.crash',
            result: 'fail',
            errorCode: 'window_error',
            errorMessage: normalizeErrorMessage(event.error ?? event.message, 'Unhandled window error'),
            extra: {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
            },
        })
    })

    window.addEventListener('unhandledrejection', (event) => {
        logError({
            category: 'app',
            name: 'app.crash',
            result: 'fail',
            errorCode: 'unhandled_rejection',
            errorMessage: normalizeErrorMessage(event.reason, 'Unhandled promise rejection'),
        })
    })
}
