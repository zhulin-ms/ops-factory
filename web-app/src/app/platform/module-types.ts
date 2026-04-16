import type { ComponentType } from 'react'

export type AccessLevel = 'public' | 'authenticated' | 'admin'

export type NavGroupKey = 'primary' | 'business' | 'config' | 'monitoring'

export type IconKey =
    | 'home'
    | 'plus'
    | 'history'
    | 'inbox'
    | 'files'
    | 'channels'
    | 'diagnosis'
    | 'businessIntelligence'
    | 'agents'
    | 'knowledge'
    | 'scheduler'
    | 'monitoring'
    | 'hostResource'

export type BadgeSource = 'none' | 'inboxUnread'

export type RouteDefinition = {
    id: string
    path: string
    component: ComponentType
    access?: AccessLevel
    hidden?: boolean
}

export type NavRouteItemDefinition = {
    id: string
    type: 'route'
    group: NavGroupKey
    order: number
    titleKey: string
    icon: IconKey
    routeId: string
    badge?: BadgeSource
    hidden?: boolean
    end?: boolean
}

export type NavActionItemDefinition = {
    id: string
    type: 'action'
    group: NavGroupKey
    order: number
    titleKey: string
    icon: IconKey
    actionId: string
    hidden?: boolean
}

export type NavItemDefinition = NavRouteItemDefinition | NavActionItemDefinition

export type ModuleContext = {
    isAdmin: boolean
    isAuthenticated: boolean
    userId?: string | null
}

export type AppModule = {
    id: string
    owner: string
    routes: RouteDefinition[]
    navItems?: NavItemDefinition[]
    enabled?: (ctx: ModuleContext) => boolean
}

export type SidebarItemModel = {
    id: string
    type: 'route' | 'action'
    titleKey: string
    icon: IconKey
    to?: string
    end?: boolean
    actionId?: string
    badge?: BadgeSource
}

export type SidebarGroupModel = {
    key: NavGroupKey
    items: SidebarItemModel[]
}
