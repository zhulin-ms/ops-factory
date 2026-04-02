import type { ReactNode } from 'react'
import './PageHeader.css'

interface PageHeaderProps {
    title: ReactNode
    subtitle?: ReactNode
    action?: ReactNode
}

export default function PageHeader({ title, subtitle, action }: PageHeaderProps) {
    return (
        <header className="page-header page-header-layout">
            <div className="page-header-content">
                <h1 className="page-title">{title}</h1>
                {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
            </div>
            {action ? <div className="page-header-action">{action}</div> : null}
        </header>
    )
}
