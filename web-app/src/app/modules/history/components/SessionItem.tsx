import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Session } from '@goosed/sdk'
import { isScheduledSession } from '../../../../config/runtime'
import ListCard from '../../../platform/ui/list/ListCard'

export type SessionWithAgent = Session & { agentId?: string }

interface SessionItemProps {
    session: SessionWithAgent
    onResume: (session: SessionWithAgent) => void
    onRename: (session: SessionWithAgent) => void
    onDelete: (session: SessionWithAgent) => void
    isDeleting?: boolean
    onMarkUnread?: (session: SessionWithAgent) => void
}

function truncateSessionId(sessionId: string, edgeLength = 6): string {
    if (sessionId.length <= edgeLength * 2 + 3) return sessionId
    return `${sessionId.slice(0, edgeLength)}...${sessionId.slice(-edgeLength)}`
}

export default function SessionItem({ session, onResume, onRename, onDelete, isDeleting = false, onMarkUnread }: SessionItemProps) {
    const { t } = useTranslation()
    const formattedDate = new Date(session.created_at).toLocaleDateString(undefined, {
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

    const handleRenameClick = (e: MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        onRename(session)
    }

    return (
        <ListCard className="session-item animate-slide-in">
            <div
                className="session-info"
                onClick={() => onResume(session)}
                style={{ cursor: 'pointer', flex: 1 }}
            >
                <div className="session-name">{session.name || t('history.untitledSession')}</div>
                <div className="session-meta">
                    <div className="session-meta-tags">
                        <span className={`session-type-badge ${sessionType}`}>{sessionType.toUpperCase()}</span>
                    </div>
                    <div className="session-meta-details">
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
                        <span className="session-meta-id" title={`${t('history.sessionIdLabel')}: ${session.id}`}>
                            · {truncateSessionId(session.id)}
                        </span>
                    </div>
                </div>
            </div>

            <div className="session-actions">
                <button
                    type="button"
                    className="session-action-btn"
                    onClick={handleRenameClick}
                    title={t('history.renameSession')}
                    aria-label={t('history.renameSession')}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                </button>
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
        </ListCard>
    )
}
