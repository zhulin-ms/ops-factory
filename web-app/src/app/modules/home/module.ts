import HomePage from './pages/HomePage'
import type { AppModule } from '../../platform/module-types'

const homeModule: AppModule = {
    id: 'home',
    owner: 'platform',
    routes: [
        { id: 'home.index', path: '/', component: HomePage, access: 'authenticated' },
    ],
    navItems: [
        {
            id: 'home.nav',
            type: 'route',
            group: 'primary',
            order: 10,
            titleKey: 'sidebar.home',
            icon: 'home',
            routeId: 'home.index',
            end: true,
        },
    ],
}

export default homeModule
