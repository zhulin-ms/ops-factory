import InboxPage from './pages/InboxPage'
import type { AppModule } from '../../platform/module-types'

const inboxModule: AppModule = {
    id: 'inbox',
    owner: 'platform',
    routes: [
        { id: 'inbox.index', path: '/inbox', component: InboxPage, access: 'authenticated' },
    ],
    navItems: [
        {
            id: 'inbox.nav',
            type: 'route',
            group: 'primary',
            order: 40,
            titleKey: 'sidebar.inbox',
            icon: 'inbox',
            routeId: 'inbox.index',
            badge: 'inboxUnread',
        },
    ],
}

export default inboxModule
