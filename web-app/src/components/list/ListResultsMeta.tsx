import type { ReactNode } from 'react'
import './ListResultsMeta.css'

interface ListResultsMetaProps {
    children: ReactNode
}

export default function ListResultsMeta({ children }: ListResultsMetaProps) {
    return <div className="list-results-meta">{children}</div>
}
