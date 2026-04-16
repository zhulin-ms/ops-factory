import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import './Button.css'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type ButtonTone = 'default' | 'subtle' | 'quiet'
type ButtonSize = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant
    tone?: ButtonTone
    size?: ButtonSize
    leadingIcon?: ReactNode
    trailingIcon?: ReactNode
    block?: boolean
    iconOnly?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
    variant = 'secondary',
    tone = 'default',
    size = 'md',
    leadingIcon,
    trailingIcon,
    block = false,
    iconOnly = false,
    className = '',
    children,
    type = 'button',
    ...props
}: ButtonProps, ref) {
    const classes = [
        'ui-button',
        `ui-button-${variant}`,
        `ui-button-size-${size}`,
        tone !== 'default' ? `ui-button-tone-${tone}` : '',
        block ? 'ui-button-block' : '',
        iconOnly ? 'ui-button-icon-only' : '',
        className,
    ].filter(Boolean).join(' ')

    return (
        <button ref={ref} type={type} className={classes} {...props}>
            {leadingIcon ? <span className="ui-button-icon" aria-hidden="true">{leadingIcon}</span> : null}
            {children}
            {trailingIcon ? <span className="ui-button-icon" aria-hidden="true">{trailingIcon}</span> : null}
        </button>
    )
})

export default Button
