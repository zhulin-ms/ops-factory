import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useGoosed } from '../contexts/GoosedContext'
import { useInbox } from '../contexts/InboxContext'
import { useToast } from '../contexts/ToastContext'
import { useUser } from '../contexts/UserContext'
import { useSidebar } from '../contexts/SidebarContext'
import { getAvatarForUser } from '../app/platform/settings/SettingsModal'
import { buildNavigation } from '../app/platform/NavigationBuilder'
import { renderIcon } from '../app/platform/icons'
import type { SidebarItemModel } from '../app/platform/module-types'
import { SidebarShell } from '../app/platform/SidebarShell'
import { useEnabledModules, useModuleContext } from '../app/platform/useEnabledModules'

export default function Sidebar() {
    const { t } = useTranslation()
    const { getClient, agents } = useGoosed()
    const { showToast } = useToast()
    const { unreadCount } = useInbox()
    const { userId } = useUser()
    const { isCollapsed, toggleSidebar } = useSidebar()
    const moduleContext = useModuleContext()
    const navigate = useNavigate()
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [isCreatingSession, setIsCreatingSession] = useState(false)

    const avatar = userId ? getAvatarForUser(userId) : '🦆'
    const enabledModules = useEnabledModules()
    const navGroups = buildNavigation(enabledModules, moduleContext)

    const handleNewChat = async () => {
        const defaultAgent = agents[0]?.id
        if (!defaultAgent || isCreatingSession) return

        setIsCreatingSession(true)
        try {
            const session = await getClient(defaultAgent).startSession()
            navigate(`/chat?sessionId=${session.id}&agent=${defaultAgent}`)
        } catch (err) {
            console.error('Failed to create session:', err)
            showToast('error', t('home.failedToCreateSession', { error: err instanceof Error ? err.message : 'Unknown error' }))
        } finally {
            setIsCreatingSession(false)
        }
    }

    const runAction = async (item: SidebarItemModel) => {
        if (item.actionId === 'chat.startNew') {
            await handleNewChat()
        }
    }

    const renderNavItem = (item: SidebarItemModel) => {
        const title = t(item.titleKey)
        const icon = renderIcon(item.icon)
        const badgeCount = item.badge === 'inboxUnread' ? unreadCount : 0

        if (item.type === 'action') {
            return (
                <button
                    type="button"
                    className="nav-link new-chat-nav"
                    title={isCollapsed ? title : undefined}
                    onClick={() => void runAction(item)}
                    disabled={item.actionId === 'chat.startNew' && isCreatingSession}
                >
                    {icon}
                    <span className="nav-label">{title}</span>
                </button>
            )
        }

        return (
            <NavLink
                to={item.to ?? '/'}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                title={isCollapsed ? title : undefined}
                end={item.end}
            >
                {icon}
                <span className="nav-label">{title}</span>
                {badgeCount > 0 && <span className="sidebar-badge">{badgeCount}</span>}
            </NavLink>
        )
    }

    return (
        <SidebarShell
            isCollapsed={isCollapsed}
            collapseTitle={isCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
            onToggleSidebar={toggleSidebar}
            logo={<span className="sidebar-logo-text">OpsFactory</span>}
            nav={(
                <nav className="sidebar-nav">
                    {navGroups.map(group => (
                        <div key={group.key} className="sidebar-nav-group">
                            {group.items.map(item => (
                                <div key={item.id}>{renderNavItem(item)}</div>
                            ))}
                        </div>
                    ))}
                </nav>
            )}
            avatar={avatar}
            userName={userId}
            settingsTitle={t('sidebar.settings')}
            onOpenSettings={() => setSettingsOpen(true)}
            settingsOpen={settingsOpen}
            onCloseSettings={() => setSettingsOpen(false)}
        />
    )
}
