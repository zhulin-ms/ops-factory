import ChatPage from './pages/ChatPage'
import type { AppModule } from '../../platform/module-types'

const chatModule: AppModule = {
    id: 'chat',
    owner: 'platform',
    routes: [
        { id: 'chat.index', path: '/chat', component: ChatPage, access: 'authenticated', hidden: true },
    ],
    navItems: [
        {
            id: 'chat.new',
            type: 'action',
            group: 'primary',
            order: 20,
            titleKey: 'sidebar.newChat',
            icon: 'plus',
            actionId: 'chat.startNew',
        },
    ],
}

export default chatModule
