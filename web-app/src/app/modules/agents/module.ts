import AgentsPage from './pages/AgentsPage'
import AgentConfigurePage from './pages/AgentConfigurePage'
import type { AppModule } from '../../platform/module-types'

const agentsModule: AppModule = {
    id: 'agents',
    owner: 'platform',
    routes: [
        { id: 'agents.index', path: '/agents', component: AgentsPage, access: 'admin' },
        { id: 'agents.configure', path: '/agents/:agentId/configure', component: AgentConfigurePage, access: 'admin', hidden: true },
    ],
    navItems: [
        {
            id: 'agents.nav',
            type: 'route',
            group: 'config',
            order: 10,
            titleKey: 'sidebar.agents',
            icon: 'agents',
            routeId: 'agents.index',
        },
    ],
}

export default agentsModule
