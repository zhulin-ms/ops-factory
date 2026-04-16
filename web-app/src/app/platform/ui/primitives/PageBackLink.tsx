import type { ReactNode } from 'react'
import './PageBackLink.css'

interface PageBackLinkProps {
    onClick: () => void
    children: ReactNode
}

export default function PageBackLink({ onClick, children }: PageBackLinkProps) {
    return (
        <button
            type="button"
            className="page-back-link"
            onClick={onClick}
        >
            <span className="page-back-link-icon" aria-hidden="true">←</span>
            {children}
        </button>
    )
}
