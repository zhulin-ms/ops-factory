import { NAV_GROUP_ORDER } from './nav-groups'
import { hasAccess } from './AccessControl'
import type { AppModule, ModuleContext, RouteDefinition, SidebarGroupModel, SidebarItemModel } from './module-types'

function indexRoutes(modules: AppModule[]) {
    const routes = new Map<string, RouteDefinition>()

    for (const module of modules) {
        for (const route of module.routes) {
            routes.set(route.id, route)
        }
    }

    return routes
}

export function buildNavigation(modules: AppModule[], ctx: ModuleContext): SidebarGroupModel[] {
    const routes = indexRoutes(modules)
    const itemsByGroup = new Map<SidebarGroupModel['key'], Array<SidebarItemModel & { order: number }>>()

    for (const group of NAV_GROUP_ORDER) {
        itemsByGroup.set(group, [])
    }

    for (const module of modules) {
        for (const item of module.navItems ?? []) {
            if (item.hidden) {
                continue
            }

            if (item.type === 'route') {
                const route = routes.get(item.routeId)
                if (!route || route.hidden || !hasAccess(route.access ?? 'authenticated', ctx)) {
                    continue
                }

                itemsByGroup.get(item.group)?.push({
                    id: item.id,
                    type: 'route',
                    titleKey: item.titleKey,
                    icon: item.icon,
                    to: route.path,
                    end: item.end,
                    badge: item.badge,
                    order: item.order,
                })
                continue
            }

            itemsByGroup.get(item.group)?.push({
                id: item.id,
                type: 'action',
                titleKey: item.titleKey,
                icon: item.icon,
                actionId: item.actionId,
                order: item.order,
            })
        }
    }

    return NAV_GROUP_ORDER
        .map((group) => ({
            key: group,
            items: (itemsByGroup.get(group) ?? [])
                .sort((left, right) => left.order - right.order)
                .map(({ order: _order, ...item }) => item),
        }))
        .filter((group) => group.items.length > 0)
}

