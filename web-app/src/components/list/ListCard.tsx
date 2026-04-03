import type { ReactNode } from 'react'
import './ListCard.css'

interface ListCardProps {
    children: ReactNode
    className?: string
    onClick?: () => void
}

export default function ListCard({ children, className, onClick }: ListCardProps) {
    return (
        <div className={['list-card', className].filter(Boolean).join(' ')} onClick={onClick}>
            {children}
        </div>
    )
}
