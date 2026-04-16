import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AppModule } from '../../platform/module-types'

function Redirect() {
    const navigate = useNavigate()
    useEffect(() => { navigate('/host-resource', { replace: true }) }, [navigate])
    return null
}

const sopWorkflowModule: AppModule = {
    id: 'sop-workflow',
    owner: 'platform',
    routes: [
        { id: 'sop-workflow.index', path: '/sop-workflow', component: Redirect, access: 'authenticated' },
        { id: 'sop-workflow.tab', path: '/sop-workflow/:tab', component: Redirect, access: 'authenticated', hidden: true },
    ],
}

export default sopWorkflowModule
