import type { ReactNode } from 'react'
import SettingsModal from './settings/SettingsModal'
import './SidebarShell.css'

export function SidebarShell({
    isCollapsed,
    collapseTitle,
    onToggleSidebar,
    logo,
    nav,
    avatar,
    userName,
    settingsTitle,
    onOpenSettings,
    settingsOpen,
    onCloseSettings,
}: {
    isCollapsed: boolean
    collapseTitle: string
    onToggleSidebar: () => void
    logo: ReactNode
    nav: ReactNode
    avatar: ReactNode
    userName: ReactNode
    settingsTitle: string
    onOpenSettings: () => void
    settingsOpen: boolean
    onCloseSettings: () => void
}) {
    return (
        <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
            <div className="sidebar-header">
                <div className="sidebar-logo">{logo}</div>
                <button
                    className="sidebar-toggle-btn"
                    onClick={onToggleSidebar}
                    title={collapseTitle}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                        {isCollapsed ? (
                            <>
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <line x1="9" y1="3" x2="9" y2="21" />
                                <polyline points="13 8 16 12 13 16" />
                            </>
                        ) : (
                            <>
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <line x1="9" y1="3" x2="9" y2="21" />
                                <polyline points="16 8 13 12 16 16" />
                            </>
                        )}
                    </svg>
                </button>
            </div>

            {nav}

            <div className="sidebar-user-section">
                <span className="sidebar-user-avatar">{avatar}</span>
                <span className="sidebar-user-name">{userName}</span>
                <div className="sidebar-user-actions">
                    <button className="sidebar-user-btn" onClick={onOpenSettings} title={settingsTitle}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                    </button>
                </div>
            </div>

            <SettingsModal isOpen={settingsOpen} onClose={onCloseSettings} />
        </aside>
    )
}
