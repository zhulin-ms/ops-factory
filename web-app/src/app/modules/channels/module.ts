import type { AppModule } from '../../platform/module-types'
import ChannelsPage from './pages/ChannelsPage'
import ChannelConfigurePage from './pages/ChannelConfigurePage'

const channelsModule: AppModule = {
    id: 'channels',
    owner: 'platform',
    routes: [
        { id: 'channels.index', path: '/channels', component: ChannelsPage, access: 'admin' },
        { id: 'channels.configure', path: '/channels/:channelId/configure', component: ChannelConfigurePage, access: 'admin', hidden: true },
    ],
    navItems: [
        {
            id: 'channels.nav',
            type: 'route',
            group: 'config',
            order: 20,
            titleKey: 'sidebar.channels',
            icon: 'channels',
            routeId: 'channels.index',
        },
    ],
}

export default channelsModule
