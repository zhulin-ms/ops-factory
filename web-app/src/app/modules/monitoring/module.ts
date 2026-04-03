import MonitoringPage from './pages/MonitoringPage'
import type { AppModule } from '../../platform/module-types'

const monitoringModule: AppModule = {
    id: 'monitoring',
    owner: 'platform',
    routes: [
        { id: 'monitoring.index', path: '/monitoring', component: MonitoringPage, access: 'admin' },
    ],
    navItems: [
        {
            id: 'monitoring.nav',
            type: 'route',
            group: 'monitoring',
            order: 10,
            titleKey: 'sidebar.monitoring',
            icon: 'monitoring',
            routeId: 'monitoring.index',
        },
    ],
}

export default monitoringModule
