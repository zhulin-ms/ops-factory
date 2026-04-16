import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import Button from './Button'
import './ActionMenu.css'

type ActionMenuItemTone = 'default' | 'danger'
type ActionMenuAlign = 'start' | 'end'
type ActionMenuButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type ActionMenuButtonTone = 'default' | 'subtle' | 'quiet'
type ActionMenuButtonSize = 'sm' | 'md'

export interface ActionMenuItem {
    key: string
    label: ReactNode
    description?: ReactNode
    onSelect: () => void
    disabled?: boolean
    tone?: ActionMenuItemTone
    dividerBefore?: boolean
}

interface ActionMenuProps {
    label: ReactNode
    items: ActionMenuItem[]
    align?: ActionMenuAlign
    variant?: ActionMenuButtonVariant
    tone?: ActionMenuButtonTone
    size?: ActionMenuButtonSize
    disabled?: boolean
    className?: string
    panelClassName?: string
    ariaLabel?: string
}

function getNextEnabledIndex(items: ActionMenuItem[], startIndex: number, direction: 1 | -1): number {
    if (items.length === 0) return -1

    let index = startIndex
    for (let remaining = 0; remaining < items.length; remaining += 1) {
        index = (index + direction + items.length) % items.length
        if (!items[index]?.disabled) {
            return index
        }
    }

    return -1
}

export default function ActionMenu({
    label,
    items,
    align = 'end',
    variant = 'secondary',
    tone = 'default',
    size = 'md',
    disabled = false,
    className = '',
    panelClassName = '',
    ariaLabel,
}: ActionMenuProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [focusedIndex, setFocusedIndex] = useState(-1)
    const rootRef = useRef<HTMLDivElement | null>(null)
    const triggerRef = useRef<HTMLButtonElement | null>(null)
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
    const menuId = useId()

    const firstEnabledIndex = useMemo(() => items.findIndex(item => !item.disabled), [items])

    const closeMenu = (restoreFocus = false) => {
        setIsOpen(false)
        setFocusedIndex(-1)
        if (restoreFocus) {
            triggerRef.current?.focus()
        }
    }

    const openMenu = (targetIndex = firstEnabledIndex) => {
        if (disabled || items.length === 0 || targetIndex < 0) return
        setIsOpen(true)
        setFocusedIndex(targetIndex)
    }

    useEffect(() => {
        if (!isOpen) return

        const handlePointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                closeMenu(false)
            }
        }

        const handleEscape = (event: globalThis.KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeMenu(true)
            }
        }

        document.addEventListener('mousedown', handlePointerDown)
        document.addEventListener('keydown', handleEscape)

        return () => {
            document.removeEventListener('mousedown', handlePointerDown)
            document.removeEventListener('keydown', handleEscape)
        }
    }, [isOpen])

    useEffect(() => {
        if (!isOpen || focusedIndex < 0) return
        itemRefs.current[focusedIndex]?.focus()
    }, [focusedIndex, isOpen])

    const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (disabled || items.length === 0) return

        if (event.key === 'ArrowDown') {
            event.preventDefault()
            openMenu(firstEnabledIndex)
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault()
            const lastEnabledIndex = getNextEnabledIndex(items, 0, -1)
            openMenu(lastEnabledIndex)
        }
    }

    const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (!isOpen) return

        if (event.key === 'ArrowDown') {
            event.preventDefault()
            setFocusedIndex(current => getNextEnabledIndex(items, current, 1))
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault()
            setFocusedIndex(current => getNextEnabledIndex(items, current, -1))
        }

        if (event.key === 'Home') {
            event.preventDefault()
            setFocusedIndex(firstEnabledIndex)
        }

        if (event.key === 'End') {
            event.preventDefault()
            setFocusedIndex(getNextEnabledIndex(items, 0, -1))
        }

        if (event.key === 'Tab') {
            closeMenu(false)
        }
    }

    return (
        <div
            className={`ui-action-menu ui-action-menu-align-${align} ${className}`.trim()}
            ref={rootRef}
        >
            <Button
                ref={triggerRef}
                variant={variant}
                tone={tone}
                size={size}
                disabled={disabled}
                className={`ui-action-menu-trigger ${isOpen ? 'is-open' : ''}`}
                onClick={() => (isOpen ? closeMenu(false) : openMenu())}
                onKeyDown={handleTriggerKeyDown}
                aria-label={ariaLabel}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                aria-controls={isOpen ? menuId : undefined}
                trailingIcon={<ChevronDown size={14} className={`ui-action-menu-chevron ${isOpen ? 'is-open' : ''}`} />}
            >
                {label}
            </Button>

            {isOpen && (
                <div
                    id={menuId}
                    className={`ui-action-menu-panel ${panelClassName}`.trim()}
                    role="menu"
                    aria-orientation="vertical"
                    onKeyDown={handleMenuKeyDown}
                >
                    {items.map((item, index) => (
                        <button
                            key={item.key}
                            ref={node => {
                                itemRefs.current[index] = node
                            }}
                            type="button"
                            role="menuitem"
                            className={[
                                'ui-action-menu-item',
                                item.tone === 'danger' ? 'is-danger' : '',
                                item.dividerBefore ? 'has-divider' : '',
                            ].filter(Boolean).join(' ')}
                            disabled={item.disabled}
                            onClick={() => {
                                closeMenu(false)
                                item.onSelect()
                            }}
                        >
                            <span className="ui-action-menu-item-text">
                                <span className="ui-action-menu-item-label">{item.label}</span>
                                {item.description ? (
                                    <span className="ui-action-menu-item-description">{item.description}</span>
                                ) : null}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
