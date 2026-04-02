import type { ReactNode } from 'react'
import { AdminRoute } from '../../contexts/UserContext'
import type { AccessLevel } from './module-types'

export function hasAccess(access: AccessLevel, ctx: { isAdmin: boolean; isAuthenticated: boolean }) {
    if (access === 'public') {
        return true
    }

    if (access === 'admin') {
        return ctx.isAdmin
    }

    return ctx.isAuthenticated
}

export function AccessGuard({
    access = 'authenticated',
    children,
}: {
    access?: AccessLevel
    children: ReactNode
}) {
    if (access === 'admin') {
        return <AdminRoute>{children}</AdminRoute>
    }

    return <>{children}</>
}

