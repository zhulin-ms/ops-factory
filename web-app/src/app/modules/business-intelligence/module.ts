import BusinessIntelligencePage from './pages/BusinessIntelligencePage'
import type { AppModule } from '../../platform/module-types'

const businessIntelligenceModule: AppModule = {
    id: 'business-intelligence',
    owner: 'platform',
    routes: [
        {
            id: 'business-intelligence.index',
            path: '/business-intelligence',
            component: BusinessIntelligencePage,
            access: 'admin',
        },
    ],
    navItems: [
        {
            id: 'business-intelligence.nav',
            type: 'route',
            group: 'business',
            order: 10,
            titleKey: 'sidebar.businessIntelligence',
            icon: 'businessIntelligence',
            routeId: 'business-intelligence.index',
        },
    ],
}

export default businessIntelligenceModule
