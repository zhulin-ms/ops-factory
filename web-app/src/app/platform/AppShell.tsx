import type { ReactNode } from 'react'

export function AppShell({
    isEmbed,
    isCollapsed,
    isRightPanelOpen,
    rightPanelMode,
    sidebar,
    children,
    rightPanel,
}: {
    isEmbed: boolean
    isCollapsed: boolean
    isRightPanelOpen: boolean
    rightPanelMode: string
    sidebar: ReactNode
    children: ReactNode
    rightPanel: ReactNode
}) {
    const mainWrapperClass = [
        'main-wrapper',
        isEmbed ? 'embed-mode' : '',
        isRightPanelOpen ? 'with-right-panel' : '',
        rightPanelMode,
        isCollapsed ? 'sidebar-collapsed' : '',
    ].filter(Boolean).join(' ')

    return (
        <div className="app-container">
            {!isEmbed && sidebar}
            <div className={mainWrapperClass}>
                <main className="main-content">{children}</main>
                {!isEmbed && rightPanel}
            </div>
        </div>
    )
}

