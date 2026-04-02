import HistoryPage from './pages/HistoryPage'
import type { AppModule } from '../../platform/module-types'

const historyModule: AppModule = {
    id: 'history',
    owner: 'platform',
    routes: [
        { id: 'history.index', path: '/history', component: HistoryPage, access: 'authenticated' },
    ],
    navItems: [
        {
            id: 'history.nav',
            type: 'route',
            group: 'primary',
            order: 30,
            titleKey: 'sidebar.history',
            icon: 'history',
            routeId: 'history.index',
        },
    ],
}

export default historyModule
