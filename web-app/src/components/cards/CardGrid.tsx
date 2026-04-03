import type { ReactNode } from 'react'
import './CardGrid.css'

interface CardGridProps {
    children: ReactNode
    className?: string
}

export default function CardGrid({ children, className }: CardGridProps) {
    const cardGridClassName = ['card-grid', className].filter(Boolean).join(' ')

    return <div className={cardGridClassName}>{children}</div>
}
