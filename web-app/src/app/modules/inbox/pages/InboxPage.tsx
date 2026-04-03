import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useInbox } from '../../../../contexts/InboxContext'
import { useGoosed } from '../../../../contexts/GoosedContext'
import PageHeader from '../../../../components/PageHeader'
import Pagination from '../../../../components/Pagination'
import FilterBar from '../../../../components/filters/FilterBar'
import FilterInlineGroup from '../../../../components/filters/FilterInlineGroup'
import FilterSelect from '../../../../components/filters/FilterSelect'
import ListCard from '../../../../components/list/ListCard'
import ListFooter from '../../../../components/list/ListFooter'
import ListSearchInput from '../../../../components/list/ListSearchInput'
import ListWorkbench from '../../../../components/list/ListWorkbench'
import '../styles/inbox.css'

function formatAgentLabel(agentId: string) {
    return agentId
        .split(/[-_]/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
}

export default function InboxPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { isConnected, error: connectionError } = useGoosed()
    const { unreadSessions, isLoading, markSessionRead } = useInbox()
    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(10)
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedAgent, setSelectedAgent] = useState('all')

    const agentOptions = useMemo(() => {
        const ids = Array.from(new Set(unreadSessions.map((session) => session.agentId)))
        return [
            { value: 'all', label: 'All' },
            ...ids.map((id) => ({
                value: id,
                label: formatAgentLabel(id),
            })),
        ]
    }, [unreadSessions])

    const filteredSessions = useMemo(() => {
        let result = unreadSessions

        if (selectedAgent !== 'all') {
            result = result.filter((session) => session.agentId === selectedAgent)
        }

        if (!searchTerm.trim()) return result

        const term = searchTerm.toLowerCase()
        return result.filter((session) =>
            (session.name || session.id).toLowerCase().includes(term) ||
            session.agentId.toLowerCase().includes(term) ||
            (session.schedule_id || '').toLowerCase().includes(term),
        )
    }, [unreadSessions, searchTerm, selectedAgent])

    const totalPages = Math.max(1, Math.ceil(filteredSessions.length / pageSize))
    const paginatedSessions = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize
        const endIndex = startIndex + pageSize
        return filteredSessions.slice(startIndex, endIndex)
    }, [filteredSessions, currentPage, pageSize])

    useEffect(() => {
        setCurrentPage(1)
    }, [unreadSessions.length, searchTerm, selectedAgent])

    const openSession = (agentId: string, sessionId: string) => {
        markSessionRead(agentId, sessionId)
        navigate(`/chat?sessionId=${sessionId}&agent=${agentId}`)
    }

    return (
        <div className="page-container sidebar-top-page inbox-page">
            <PageHeader title={t('inbox.title')} subtitle={t('inbox.subtitle')} />

            {!isConnected && connectionError && (
                <div className="conn-banner conn-banner-error">
                    {t('common.connectionError', { error: connectionError })}
                </div>
            )}

            <ListWorkbench
                controls={(
                    <FilterBar
                        primary={(
                            <FilterInlineGroup>
                                <ListSearchInput
                                    value={searchTerm}
                                    placeholder={t('inbox.searchPlaceholder')}
                                    onChange={setSearchTerm}
                                />
                                <FilterSelect
                                    value={selectedAgent}
                                    options={agentOptions}
                                    onChange={setSelectedAgent}
                                />
                            </FilterInlineGroup>
                        )}
                    />
                )}
                footer={filteredSessions.length > 0 ? (
                    <ListFooter>
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            pageSize={pageSize}
                            totalItems={filteredSessions.length}
                            onPageChange={setCurrentPage}
                            onPageSizeChange={(newSize) => {
                                setPageSize(newSize)
                                setCurrentPage(1)
                            }}
                            disabled={isLoading}
                        />
                    </ListFooter>
                ) : undefined}
            >
                {isLoading ? (
                    <div className="empty-state">
                        <h3 className="empty-state-title">{t('inbox.loadingInbox')}</h3>
                    </div>
                ) : unreadSessions.length === 0 ? (
                    <div className="empty-state">
                        <h3 className="empty-state-title">{t('inbox.inboxClear')}</h3>
                        <p className="empty-state-description">{t('inbox.noUnreadSessions')}</p>
                    </div>
                ) : searchTerm && filteredSessions.length === 0 ? (
                    <div className="empty-state">
                        <h3 className="empty-state-title">{t('common.noResults')}</h3>
                        <p className="empty-state-description">{t('inbox.noMatchSessions', { term: searchTerm })}</p>
                    </div>
                ) : (
                    <div className="inbox-list">
                        {paginatedSessions.map((session) => (
                            <ListCard key={`${session.agentId}:${session.id}`} className="inbox-item">
                                <div className="inbox-item-main">
                                    <div className="inbox-item-title">{session.name || session.id}</div>
                                    <div className="inbox-item-meta">
                                        <div className="inbox-item-tags">
                                            <span className="session-type-badge scheduled">UNREAD</span>
                                            <span className="inbox-agent-tag">{formatAgentLabel(session.agentId)}</span>
                                        </div>
                                        <div className="inbox-item-details">
                                            <span>{new Date(session.updated_at || session.created_at).toLocaleString()}</span>
                                            {session.schedule_id && <span>{t('history.schedule', { id: session.schedule_id })}</span>}
                                            {session.message_count !== undefined && <span>{session.message_count} {t('common.messages')}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="inbox-item-actions">
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={() => markSessionRead(session.agentId, session.id)}
                                    >
                                        {t('inbox.dismiss')}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={() => openSession(session.agentId, session.id)}
                                    >
                                        {t('common.open')}
                                    </button>
                                </div>
                            </ListCard>
                        ))}
                    </div>
                )}
            </ListWorkbench>
        </div>
    )
}
