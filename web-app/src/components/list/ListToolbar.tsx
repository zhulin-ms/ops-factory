import type { ReactNode } from 'react'
import './ListToolbar.css'

interface ListToolbarProps {
    primary?: ReactNode
    secondary?: ReactNode
}

export default function ListToolbar({ primary, secondary }: ListToolbarProps) {
    return (
        <div className="list-toolbar">
            <div className="list-toolbar-primary">{primary}</div>
            {secondary ? <div className="list-toolbar-secondary">{secondary}</div> : null}
        </div>
    )
}
