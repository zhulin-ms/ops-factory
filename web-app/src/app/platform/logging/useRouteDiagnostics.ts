import { useEffect, useRef } from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import { clearLoggingContext, updateLoggingContext } from './context'
import { createPageViewId } from './ids'
import { logInfo } from './logger'
import type { AppModule } from '../module-types'

type RouteDescriptor = {
    routeId?: string
    moduleId?: string
}

function resolveRouteDescriptor(modules: AppModule[], pathname: string): RouteDescriptor {
    for (const module of modules) {
        for (const route of module.routes) {
            if (matchPath({ path: route.path, end: true }, pathname)) {
                return {
                    routeId: route.id,
                    moduleId: module.id,
                }
            }
        }
    }

    return {}
}

export function useRouteDiagnostics(modules: AppModule[]) {
    const location = useLocation()
    const pageViewRef = useRef<string | null>(null)

    useEffect(() => {
        const pageViewId = createPageViewId()
        const descriptor = resolveRouteDescriptor(modules, location.pathname)
        const path = `${location.pathname}${location.search}`

        pageViewRef.current = pageViewId
        updateLoggingContext({
            pageViewId,
            routeId: descriptor.routeId,
            moduleId: descriptor.moduleId,
        })

        logInfo({
            category: 'route',
            name: 'route.enter',
            pageViewId,
            routeId: descriptor.routeId,
            moduleId: descriptor.moduleId,
            path,
            result: 'start',
        })

        queueMicrotask(() => {
            if (pageViewRef.current !== pageViewId) {
                return
            }

            logInfo({
                category: 'route',
                name: 'route.ready',
                pageViewId,
                routeId: descriptor.routeId,
                moduleId: descriptor.moduleId,
                path,
                result: 'success',
            })
        })

        return () => {
            logInfo({
                category: 'route',
                name: 'route.leave',
                pageViewId,
                routeId: descriptor.routeId,
                moduleId: descriptor.moduleId,
                path,
                result: 'success',
            })

            if (pageViewRef.current === pageViewId) {
                pageViewRef.current = null
                clearLoggingContext(['pageViewId', 'routeId', 'moduleId'])
            }
        }
    }, [location.key, location.pathname, location.search, modules])
}
