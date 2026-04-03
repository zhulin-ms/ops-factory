import type { ReactNode } from 'react'
import './ListFooter.css'

interface ListFooterProps {
    children: ReactNode
}

export default function ListFooter({ children }: ListFooterProps) {
    return <div className="list-footer">{children}</div>
}
