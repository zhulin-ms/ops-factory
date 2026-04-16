import { useMemo } from 'react'
import { isAdminUser } from '../../config/runtime'
import { useUser } from './providers/UserContext'
import { loadModules } from './ModuleLoader'
import type { ModuleContext } from './module-types'

const ALL_MODULES = loadModules()

export function useModuleContext(): ModuleContext {
    const { userId, role } = useUser()
    const isAdmin = isAdminUser(userId, role)

    return {
        isAdmin,
        isAuthenticated: !!userId,
        userId,
    }
}

export function useEnabledModules() {
    const ctx = useModuleContext()

    return useMemo(
        () => ALL_MODULES.filter((module) => module.enabled?.(ctx) ?? true),
        [ctx.isAdmin, ctx.isAuthenticated, ctx.userId]
    )
}
