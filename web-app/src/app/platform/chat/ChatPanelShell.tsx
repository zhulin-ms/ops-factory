import type { ReactNode } from 'react'
import './ChatPanelShell.css'

interface ChatPanelShellProps {
    header?: ReactNode
    children: ReactNode
    className?: string
    bodyClassName?: string
    scrollBody?: boolean
}

function joinClasses(...classes: Array<string | false | null | undefined>) {
    return classes.filter(Boolean).join(' ')
}

export default function ChatPanelShell({
    header,
    children,
    className,
    bodyClassName,
    scrollBody = true,
}: ChatPanelShellProps) {
    return (
        <section className={joinClasses('chat-panel-shell', className)}>
            {header ? <div className="chat-panel-shell-header">{header}</div> : null}
            <div className={joinClasses('chat-panel-shell-body', scrollBody && 'scrollable', bodyClassName)}>
                {children}
            </div>
        </section>
    )
}
