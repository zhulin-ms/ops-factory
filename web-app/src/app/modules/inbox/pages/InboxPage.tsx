import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useInbox } from '../../../../contexts/InboxContext'
import { useGoosed } from '../../../../contexts/GoosedContext'
import '../styles/inbox.css'

export default function InboxPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { isConnected, error: connectionError } = useGoosed()
    const { unreadSessions, unreadCount, isLoading, markSessionRead, markAllRead } = useInbox()

    const groupedByAgent = useMemo(() => {
        const map = new Map<string, typeof unreadSessions>()
        for (const session of unreadSessions) {
            const list = map.get(session.agentId) ?? []
            list.push(session)
            map.set(session.agentId, list)
        }
        return Array.from(map.entries())
    }, [unreadSessions])

    const openSession = (agentId: string, sessionId: string) => {
        markSessionRead(agentId, sessionId)
        navigate(`/chat?sessionId=${sessionId}&agent=${agentId}`)
    }

    return (
        <div className="page-container sidebar-top-page inbox-page">
            <header className="page-header">
                <h1 className="page-title">{t('inbox.title')}</h1>
                <p className="page-subtitle">{t('inbox.subtitle')}</p>
            </header>

            {!isConnected && connectionError && (
                <div className="conn-banner conn-banner-error">
                    {t('common.connectionError', { error: connectionError })}
                </div>
            )}

            <div className="inbox-toolbar">
                <div className="inbox-count">{t('inbox.unread', { count: unreadCount })}</div>
                <div className="inbox-toolbar-actions">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={markAllRead}
                        disabled={unreadCount === 0}
                    >
                        {t('inbox.markAllRead')}
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="empty-state">
                    <h3 className="empty-state-title">{t('inbox.loadingInbox')}</h3>
                </div>
            ) : unreadSessions.length === 0 ? (
                <div className="empty-state">
                    <h3 className="empty-state-title">{t('inbox.inboxClear')}</h3>
                    <p className="empty-state-description">{t('inbox.noUnreadSessions')}</p>
                </div>
            ) : (
                <div className="inbox-groups">
                    {groupedByAgent.map(([agentId, sessions]) => (
                        <section key={agentId} className="inbox-group">
                            <h3 className="inbox-group-title">{agentId}</h3>
                            <div className="inbox-list">
                                {sessions.map((session) => (
                                    <div key={`${session.agentId}:${session.id}`} className="inbox-item">
                                        <div className="inbox-item-main">
                                            <div className="inbox-item-title">{session.name || session.id}</div>
                                            <div className="inbox-item-meta">
                                                <span className="session-type-badge scheduled">UNREAD</span>
                                                {session.schedule_id && <span>{t('history.schedule', { id: session.schedule_id })}</span>}
                                                <span>{new Date(session.updated_at || session.created_at).toLocaleString()}</span>
                                                {session.message_count !== undefined && <span>{session.message_count} {t('common.messages')}</span>}
                                            </div>
                                        </div>
                                        <div className="inbox-item-actions">
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                onClick={() => markSessionRead(agentId, session.id)}
                                            >
                                                {t('inbox.dismiss')}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn btn-primary"
                                                onClick={() => openSession(agentId, session.id)}
                                            >
                                                {t('common.open')}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    )
}
