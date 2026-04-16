import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getUrlParam } from '../../../utils/urlParams'
import './Toast.css'

export interface Toast {
    id: string
    type: 'success' | 'error' | 'warning' | 'info'
    message: string
    duration?: number
}

interface ToastPresentation {
    preview: boolean
}

interface ToastContextType {
    toasts: Toast[]
    showToast: (type: Toast['type'], message: string) => void
    removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function useToast() {
    const context = useContext(ToastContext)
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider')
    }
    return context
}

interface ToastProviderProps {
    children: ReactNode
}

const TOAST_PREVIEW_FIXTURES: Toast[] = [
    {
        id: 'preview-success',
        type: 'success',
        message: 'Saved knowledge base 设计文档',
        duration: 60_000,
    },
    {
        id: 'preview-error',
        type: 'error',
        message: 'Enter valid numeric values',
        duration: 60_000,
    },
]

export function ToastProvider({ children }: ToastProviderProps) {
    const [toasts, setToasts] = useState<Toast[]>([])
    const presentation = resolveToastPresentation()

    const showToast = useCallback((type: Toast['type'], message: string) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
        const newToast: Toast = {
            id,
            type,
            message,
            duration: 3200,
        }

        setToasts(prev => [...prev, newToast])
    }, [])

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    return (
        <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
            {children}
            <ToastContainer toasts={toasts} onRemove={removeToast} presentation={presentation} />
        </ToastContext.Provider>
    )
}

interface ToastContainerProps {
    toasts: Toast[]
    onRemove: (id: string) => void
    presentation: ToastPresentation
}

function ToastContainer({ toasts, onRemove, presentation }: ToastContainerProps) {
    const displayToasts = toasts.length > 0
        ? toasts
        : presentation.preview
            ? TOAST_PREVIEW_FIXTURES
            : []

    if (displayToasts.length === 0) return null

    return (
        <div className="toast-container" aria-live="polite" aria-atomic="false">
            {displayToasts.map(toast => (
                <ToastItem
                    key={toast.id}
                    toast={toast}
                    onRemove={onRemove}
                    isPreview={toasts.length === 0}
                />
            ))}
        </div>
    )
}

interface ToastItemProps {
    toast: Toast
    onRemove: (id: string) => void
    isPreview?: boolean
}

function ToastItem({ toast, onRemove, isPreview = false }: ToastItemProps) {
    const { t } = useTranslation()
    const duration = toast.duration ?? 3200
    const [remaining, setRemaining] = useState(duration)
    const [isPaused, setIsPaused] = useState(false)
    const timeoutRef = useRef<number | null>(null)
    const startedAtRef = useRef<number>(0)

    const clearRemovalTimer = useCallback(() => {
        if (timeoutRef.current !== null) {
            window.clearTimeout(timeoutRef.current)
            timeoutRef.current = null
        }
    }, [])

    const scheduleRemoval = useCallback((delay: number) => {
        clearRemovalTimer()
        startedAtRef.current = Date.now()
        timeoutRef.current = window.setTimeout(() => {
            onRemove(toast.id)
        }, delay)
    }, [clearRemovalTimer, onRemove, toast.id])

    useEffect(() => {
        if (isPaused) {
            return clearRemovalTimer
        }
        scheduleRemoval(remaining)
        return clearRemovalTimer
    }, [clearRemovalTimer, isPaused, remaining, scheduleRemoval])

    const handlePause = useCallback(() => {
        clearRemovalTimer()
        const elapsed = Date.now() - startedAtRef.current
        setRemaining(current => Math.max(0, current - elapsed))
        setIsPaused(true)
    }, [clearRemovalTimer])

    const handleResume = useCallback(() => {
        if (remaining <= 0) {
            onRemove(toast.id)
            return
        }
        setIsPaused(false)
    }, [onRemove, remaining, toast.id])

    return (
        <div
            className={`toast toast-${toast.type} ${isPreview ? 'toast-preview-item' : ''}`}
            role={toast.type === 'error' ? 'alert' : 'status'}
            onMouseEnter={handlePause}
            onMouseLeave={handleResume}
        >
            <span className="toast-icon" aria-hidden="true">
                {renderToastIcon(toast.type)}
            </span>
            <span className="toast-message">{toast.message}</span>
            <button
                type="button"
                className="toast-close"
                onClick={() => onRemove(toast.id)}
                aria-label={t('close')}
            >
                <X size={14} strokeWidth={2.25} />
            </button>
        </div>
    )
}

function renderToastIcon(type: Toast['type']) {
    switch (type) {
        case 'success':
            return <CheckCircle2 size={16} strokeWidth={2.25} />
        case 'error':
            return <AlertCircle size={16} strokeWidth={2.25} />
        case 'warning':
            return <TriangleAlert size={16} strokeWidth={2.25} />
        case 'info':
            return <Info size={16} strokeWidth={2.25} />
    }
}

function resolveToastPresentation(): ToastPresentation {
    const toastPreview = getUrlParam('toastPreview') === 'true'

    return {
        preview: toastPreview || getUrlParam('toastCompare') === 'true',
    }
}
