import KnowledgePage from './pages/KnowledgePage'
import KnowledgeConfigurePage from './pages/KnowledgeConfigurePage'
import type { AppModule } from '../../platform/module-types'

const knowledgeModule: AppModule = {
    id: 'knowledge',
    owner: 'platform',
    routes: [
        { id: 'knowledge.index', path: '/knowledge', component: KnowledgePage, access: 'admin' },
        { id: 'knowledge.configure', path: '/knowledge/:sourceId', component: KnowledgeConfigurePage, access: 'admin', hidden: true },
    ],
    navItems: [
        {
            id: 'knowledge.nav',
            type: 'route',
            group: 'config',
            order: 20,
            titleKey: 'sidebar.knowledge',
            icon: 'knowledge',
            routeId: 'knowledge.index',
        },
    ],
}

export default knowledgeModule
