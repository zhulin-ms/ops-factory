import HostResourcePage from './pages/HostResourcePage'
import type { AppModule } from '../../platform/module-types'

const hostResourceModule: AppModule = {
    id: 'host-resource',
    owner: 'platform',
    routes: [
        { id: 'host-resource.index', path: '/host-resource', component: HostResourcePage, access: 'admin' },
    ],
    navItems: [
        {
            id: 'host-resource.nav',
            type: 'route',
            group: 'config',
            order: 15,
            titleKey: 'sidebar.hostResource',
            icon: 'hostResource',
            routeId: 'host-resource.index',
        },
    ],
}

export default hostResourceModule
