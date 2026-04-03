import type { ReactNode } from 'react'
import './ListWorkbench.css'

interface ListWorkbenchProps {
    controls?: ReactNode
    children: ReactNode
    footer?: ReactNode
}

export default function ListWorkbench({ controls, children, footer }: ListWorkbenchProps) {
    return (
        <div className="list-workbench">
            {controls ? <div className="list-workbench-controls">{controls}</div> : null}
            <div className="list-workbench-body">{children}</div>
            {footer ? <div className="list-workbench-footer">{footer}</div> : null}
        </div>
    )
}
