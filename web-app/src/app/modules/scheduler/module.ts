import ScheduledActions from '../../../pages/ScheduledActions'
import type { AppModule } from '../../platform/module-types'

const schedulerModule: AppModule = {
    id: 'scheduler',
    owner: 'platform',
    routes: [
        { id: 'scheduler.index', path: '/scheduler', component: ScheduledActions, access: 'admin' },
    ],
    navItems: [
        {
            id: 'scheduler.nav',
            type: 'route',
            group: 'config',
            order: 30,
            titleKey: 'sidebar.scheduler',
            icon: 'scheduler',
            routeId: 'scheduler.index',
        },
    ],
}

export default schedulerModule
