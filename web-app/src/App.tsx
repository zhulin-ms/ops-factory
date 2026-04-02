import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import { PreviewProvider, usePreview } from './contexts/PreviewContext'
import { InboxProvider } from './contexts/InboxContext'
import { SidebarProvider, useSidebar } from './contexts/SidebarContext'
import { RightPanelProvider, useRightPanel } from './contexts/RightPanelContext'
import { getUrlParam } from './utils/urlParams'
import { buildRoutes } from './app/platform/RouteBuilder'
import { AppShell } from './app/platform/AppShell'
import { RightPanelHost } from './app/platform/RightPanelHost'
import { useEnabledModules } from './app/platform/useEnabledModules'

const IS_EMBED = getUrlParam('embed') === 'true'

function AppContent() {
    const { previewFile } = usePreview()
    const { isCollapsed } = useSidebar()
    const { isMarketOpen } = useRightPanel()
    const isPreviewOpen = !!previewFile
    const isRightPanelOpen = isMarketOpen || isPreviewOpen
    const rightPanelMode = isMarketOpen ? 'panel-drawer' : isPreviewOpen ? 'panel-preview' : ''
    const isEmbed = IS_EMBED
    const enabledModules = useEnabledModules()
    const routes = buildRoutes(enabledModules)

    return (
        <AppShell
            isEmbed={isEmbed}
            isCollapsed={isCollapsed}
            isRightPanelOpen={isRightPanelOpen}
            rightPanelMode={rightPanelMode}
            sidebar={<Sidebar />}
            rightPanel={<RightPanelHost />}
        >
            <Routes>{routes}</Routes>
        </AppShell>
    )
}

export default function App() {
    return (
        <Routes>
            <Route path="/*" element={
                <SidebarProvider>
                    <InboxProvider>
                        <PreviewProvider>
                            <RightPanelProvider>
                                <AppContent />
                            </RightPanelProvider>
                        </PreviewProvider>
                    </InboxProvider>
                </SidebarProvider>
            } />
        </Routes>
    )
}
