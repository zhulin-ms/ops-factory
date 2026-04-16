import ControlCenterPage from './pages/ControlCenterPage'
import ManagedServiceDetailPage from './pages/ManagedServiceDetailPage'
import type { AppModule } from '../../platform/module-types'

const controlCenterModule: AppModule = {
    id: 'control-center',
    owner: 'platform',
    routes: [
        { id: 'control-center.index', path: '/control-center', component: ControlCenterPage, access: 'admin' },
        { id: 'control-center.service', path: '/control-center/services/:serviceId', component: ManagedServiceDetailPage, access: 'admin', hidden: true },
    ],
    navItems: [
        {
            id: 'control-center.nav',
            type: 'route',
            group: 'monitoring',
            order: 9,
            titleKey: 'sidebar.controlCenter',
            icon: 'monitoring',
            routeId: 'control-center.index',
        },
    ],
}

export default controlCenterModule
