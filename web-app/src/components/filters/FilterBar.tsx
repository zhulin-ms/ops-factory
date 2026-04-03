import type { ReactNode } from 'react'
import './FilterBar.css'

interface FilterBarProps {
    primary?: ReactNode
    secondary?: ReactNode
}

export default function FilterBar({ primary, secondary }: FilterBarProps) {
    return (
        <div className="filter-bar">
            <div className="filter-bar-primary">{primary}</div>
            {secondary ? <div className="filter-bar-secondary">{secondary}</div> : null}
        </div>
    )
}
