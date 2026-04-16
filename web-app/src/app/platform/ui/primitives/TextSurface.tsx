import type { ChangeEventHandler } from 'react'
import { useEffect, useRef } from 'react'
import './TextSurface.css'

interface TextSurfaceProps {
    value: string
    onChange?: ChangeEventHandler<HTMLTextAreaElement>
    readOnly?: boolean
    minHeight?: number
    className?: string
    spellCheck?: boolean
    scrollToBottomOnChange?: boolean
}

export default function TextSurface({
    value,
    onChange,
    readOnly = false,
    minHeight = 420,
    className,
    spellCheck = false,
    scrollToBottomOnChange = false,
}: TextSurfaceProps) {
    const surfaceClassName = ['text-surface', className].filter(Boolean).join(' ')
    const ref = useRef<HTMLTextAreaElement | null>(null)

    useEffect(() => {
        if (!scrollToBottomOnChange || !ref.current) return
        const element = ref.current
        element.scrollTop = element.scrollHeight
    }, [value, scrollToBottomOnChange])

    return (
        <textarea
            ref={ref}
            className={surfaceClassName}
            value={value}
            onChange={onChange}
            readOnly={readOnly}
            spellCheck={spellCheck}
            style={{ minHeight }}
        />
    )
}
