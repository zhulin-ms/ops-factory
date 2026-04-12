import { isPlatformActionId } from './PlatformActions'
import type { AppModule, IconKey, NavGroupKey } from './module-types'

const validGroups = new Set<NavGroupKey>(['primary', 'business', 'config', 'monitoring'])
const validIcons = new Set<IconKey>([
    'home',
    'plus',
    'history',
    'inbox',
    'files',
    'diagnosis',
    'businessIntelligence',
    'agents',
    'knowledge',
    'scheduler',
    'monitoring',
    'hostResource',
])

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) {
        throw new Error(message)
    }
}

export function validateModules(modules: AppModule[]) {
    const moduleIds = new Set<string>()
    const routeIds = new Set<string>()
    const paths = new Set<string>()

    for (const module of modules) {
        assert(module.id, 'Module id is required')
        assert(!moduleIds.has(module.id), `Duplicate module id: ${module.id}`)
        moduleIds.add(module.id)

        assert(module.routes.length > 0, `Module ${module.id} must declare at least one route`)

        for (const route of module.routes) {
            assert(route.id, `Module ${module.id} has a route without id`)
            assert(!routeIds.has(route.id), `Duplicate route id: ${route.id}`)
            routeIds.add(route.id)

            assert(route.path, `Route ${route.id} must declare a path`)
            assert(!paths.has(route.path), `Duplicate route path: ${route.path}`)
            paths.add(route.path)
        }
    }

    for (const module of modules) {
        for (const item of module.navItems ?? []) {
            assert(validGroups.has(item.group), `Invalid nav group "${item.group}" in module ${module.id}`)
            assert(validIcons.has(item.icon), `Invalid icon "${item.icon}" in module ${module.id}`)
            assert(Number.isFinite(item.order), `Invalid nav order for "${item.id}" in module ${module.id}`)
            assert(item.titleKey, `Missing titleKey for nav item "${item.id}" in module ${module.id}`)

            if (item.type === 'route') {
                assert(routeIds.has(item.routeId), `Nav item "${item.id}" references unknown route "${item.routeId}"`)
            } else {
                assert(isPlatformActionId(item.actionId), `Nav item "${item.id}" references unknown action "${item.actionId}"`)
            }
        }
    }
}

