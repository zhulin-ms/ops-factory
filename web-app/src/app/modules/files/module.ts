import FilesPage from './pages/FilesPage'
import type { AppModule } from '../../platform/module-types'

const filesModule: AppModule = {
    id: 'files',
    owner: 'platform',
    routes: [
        { id: 'files.index', path: '/files', component: FilesPage, access: 'authenticated' },
    ],
    navItems: [
        {
            id: 'files.nav',
            type: 'route',
            group: 'primary',
            order: 50,
            titleKey: 'sidebar.files',
            icon: 'files',
            routeId: 'files.index',
        },
    ],
}

export default filesModule
