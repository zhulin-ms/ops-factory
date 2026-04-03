import type { ReactNode, MouseEvent } from 'react'

type DetailDialogVariant = 'default' | 'wide'

interface DetailDialogProps {
    title: ReactNode
    onClose: () => void
    children: ReactNode
    footer?: ReactNode
    variant?: DetailDialogVariant
    className?: string
    bodyClassName?: string
}

export default function DetailDialog({
    title,
    onClose,
    children,
    footer,
    variant = 'default',
    className,
    bodyClassName,
}: DetailDialogProps) {
    const contentClassName = ['modal-content', `modal-${variant}`, className].filter(Boolean).join(' ')
    const contentBodyClassName = ['modal-body', bodyClassName].filter(Boolean).join(' ')

    const handleOverlayClick = () => {
        onClose()
    }

    const handleContentClick = (event: MouseEvent<HTMLDivElement>) => {
        event.stopPropagation()
    }

    return (
        <div className="modal-overlay" role="dialog" aria-modal="true" onClick={handleOverlayClick}>
            <div className={contentClassName} onClick={handleContentClick}>
                <div className="modal-header">
                    <h3 className="modal-title">{title}</h3>
                    <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog">
                        ×
                    </button>
                </div>
                <div className={contentBodyClassName}>
                    {children}
                </div>
                {footer ? <div className="modal-footer">{footer}</div> : null}
            </div>
        </div>
    )
}
