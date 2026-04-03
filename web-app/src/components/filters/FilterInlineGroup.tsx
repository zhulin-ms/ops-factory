import type { ReactNode } from 'react'
import './FilterInlineGroup.css'

interface FilterInlineGroupProps {
    children: ReactNode
}

export default function FilterInlineGroup({ children }: FilterInlineGroupProps) {
    return <div className="filter-inline-group">{children}</div>
}
