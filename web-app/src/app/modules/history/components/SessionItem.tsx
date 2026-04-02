import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Session } from '@goosed/sdk'
import { isScheduledSession } from '../../../../config/runtime'

export type SessionWithAgent = Session & { agentId?: string }

interface SessionItemProps {
    session: SessionWithAgent
    onResume: (session: SessionWithAgent) => void
    onDelete: (session: SessionWithAgent) => void
    isDeleting?: boolean
    onMarkUnread?: (session: SessionWithAgent) => void
}

export default function SessionItem({ session, onResume, onDelete, isDeleting = false, onMarkUnread }: SessionItemProps) {
    const { t } = useTranslation()
    const formattedDate = new Date(session.updated_at || session.created_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
    const sessionType = isScheduledSession(session) ? 'scheduled' : 'user'

    const handleDeleteClick = (e: MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        onDelete(session)
    }

    return (
        <div className="session-item animate-slide-in">
            <div
                className="session-info"
                onClick={() => onResume(session)}
                style={{ cursor: 'pointer', flex: 1 }}
            >
                <div className="session-name">{session.name || t('history.untitledSession')}</div>
                <div className="session-meta">
                    <span className={`session-type-badge ${sessionType}`}>{sessionType.toUpperCase()}</span>
                    {sessionType === 'scheduled' && session.schedule_id && (
                        <span className="session-schedule-id">{t('history.schedule', { id: session.schedule_id })}</span>
                    )}
                    <span>{formattedDate}</span>
                    {session.message_count !== undefined && (
                        <span>{session.message_count} {t('common.messages')}</span>
                    )}
                    {session.total_tokens !== undefined && session.total_tokens !== null && (
                        <span>{session.total_tokens.toLocaleString()} {t('common.tokens')}</span>
                    )}
                </div>
            </div>

            <div className="session-actions">
                {onMarkUnread && sessionType === 'scheduled' && (
                    <button
                        type="button"
                        className="session-action-btn"
                        onClick={(e: MouseEvent) => {
                            e.preventDefault()
                            e.stopPropagation()
                            onMarkUnread(session)
                        }}
                        title={t('history.moveToInbox')}
                        aria-label={t('history.markAsUnread')}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                            <path d="M22 12h-4l-3 4H9l-3-4H2" />
                            <path d="M5 12V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7" />
                        </svg>
                    </button>
                )}
                <button
                    type="button"
                    className="session-action-btn delete"
                    onClick={handleDeleteClick}
                    disabled={isDeleting}
                    aria-busy={isDeleting}
                    title={t('common.delete')}
                    aria-label={t('history.deleteSession')}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                </button>
            </div>
        </div>
    )
}
