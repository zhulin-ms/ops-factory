import DiagnosisPage from './pages/DiagnosisPage'
import type { AppModule } from '../../platform/module-types'

const sopWorkflowModule: AppModule = {
    id: 'sop-workflow',
    owner: 'platform',
    routes: [
        { id: 'sop-workflow.index', path: '/sop-workflow', component: DiagnosisPage, access: 'authenticated' },
        { id: 'sop-workflow.tab', path: '/sop-workflow/:tab', component: DiagnosisPage, access: 'authenticated', hidden: true },
    ],
    navItems: [
        {
            id: 'sop-workflow.nav',
            type: 'route',
            group: 'business',
            order: 20,
            titleKey: 'sidebar.faultDiagnosis',
            icon: 'diagnosis',
            routeId: 'sop-workflow.index',
        },
    ],
}

export default sopWorkflowModule
