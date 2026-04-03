import type { ChangeEvent } from 'react'
import './ListSearchInput.css'

interface ListSearchInputProps {
    value: string
    placeholder: string
    onChange: (value: string) => void
    onClear?: () => void
    ariaLabel?: string
}

export default function ListSearchInput({
    value,
    placeholder,
    onChange,
    onClear,
    ariaLabel,
}: ListSearchInputProps) {
    return (
        <div className="list-search">
            <div className="list-search-input-wrapper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                    type="text"
                    className="list-search-input"
                    placeholder={placeholder}
                    value={value}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
                    aria-label={ariaLabel ?? placeholder}
                />
                {value && (
                    <button
                        type="button"
                        className="list-search-clear"
                        onClick={onClear ?? (() => onChange(''))}
                        aria-label="Clear search"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    )
}
