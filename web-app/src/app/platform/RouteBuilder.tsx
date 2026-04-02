import { Route } from 'react-router-dom'
import type { AppModule, RouteDefinition } from './module-types'
import { AccessGuard } from './AccessControl'

function renderRoute(route: RouteDefinition) {
    const Component = route.component

    return (
        <Route
            key={route.id}
            path={route.path}
            element={(
                <AccessGuard access={route.access}>
                    <Component />
                </AccessGuard>
            )}
        />
    )
}

export function buildRoutes(modules: AppModule[]) {
    return modules.flatMap((module) => module.routes.map(renderRoute))
}

