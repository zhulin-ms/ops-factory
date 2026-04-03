import type { ReactNode } from 'react'
import './CardWorkbench.css'

interface CardWorkbenchProps {
    controls?: ReactNode
    children: ReactNode
    footer?: ReactNode
}

export default function CardWorkbench({ controls, children, footer }: CardWorkbenchProps) {
    return (
        <div className="card-workbench">
            {controls && <div className="card-workbench-controls">{controls}</div>}
            <div className="card-workbench-body">{children}</div>
            {footer && <div className="card-workbench-footer">{footer}</div>}
        </div>
    )
}
