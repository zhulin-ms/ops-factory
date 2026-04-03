import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ScheduledJob, ScheduleSessionInfo } from '@goosed/sdk'
import { useGoosed } from '../../../../contexts/GoosedContext'
import { useToast } from '../../../../contexts/ToastContext'
import { useInbox } from '../../../../contexts/InboxContext'
import { useUser } from '../../../../contexts/UserContext'
import CardGrid from '../../../../components/cards/CardGrid'
import CardWorkbench from '../../../../components/cards/CardWorkbench'
import PageHeader from '../../../../components/PageHeader'
import FilterBar from '../../../../components/filters/FilterBar'
import FilterInlineGroup from '../../../../components/filters/FilterInlineGroup'
import FilterSelect from '../../../../components/filters/FilterSelect'
import ListSearchInput from '../../../../components/list/ListSearchInput'
import DetailDialog from '../../../../components/DetailDialog'
import { slugify } from '../../../../config/runtime'
import ResourceCard, { type ResourceStatusTone } from '../../../../components/ResourceCard'
import '../styles/scheduled-actions.css'

interface FormState {
    name: string
    instruction: string
    cron: string
}

interface ScheduleDraftMap {
    [agentId: string]: {
        [scheduleId: string]: {
            name: string
            instruction: string
        }
    }
}

const DEFAULT_CRON = '0 0 9 * * *'
const ALL_AGENTS = '__all__'

interface ScheduledJobRecord extends ScheduledJob {
    agentId: string
    agentName: string
}

function getScheduleDraftsKey(userId: string): string {
    return `opsfactory:${userId}:scheduler:drafts:v1`
}


function ensureUniqueId(base: string, existingIds: Set<string>): string {
    if (!existingIds.has(base)) return base
    let counter = 2
    while (existingIds.has(`${base}-${counter}`)) {
        counter += 1
    }
    return `${base}-${counter}`
}

function isCronLikelyValid(cron: string): boolean {
    const parts = cron.trim().split(/\s+/)
    return parts.length === 5 || parts.length === 6
}

function loadDrafts(storageKey: string): ScheduleDraftMap {
    if (typeof window === 'undefined') return {}
    try {
        const raw = window.localStorage.getItem(storageKey)
        if (!raw) return {}
        const parsed = JSON.parse(raw) as ScheduleDraftMap
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

function saveDrafts(storageKey: string, drafts: ScheduleDraftMap): void {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, JSON.stringify(drafts))
}

function getScheduleStatusTone(job: ScheduledJob): ResourceStatusTone {
    if (job.currently_running) return 'warning'
    if (job.paused) return 'neutral'
    return 'success'
}

export default function ScheduledActions() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { userId } = useUser()
    const { agents, getClient, isConnected, error } = useGoosed()
    const { showToast } = useToast()
    const { markSessionRead } = useInbox()

    const draftsKey = getScheduleDraftsKey(userId || 'anonymous')
    const [selectedAgent, setSelectedAgent] = useState(ALL_AGENTS)
    const [jobs, setJobs] = useState<ScheduledJobRecord[]>([])
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [editingJob, setEditingJob] = useState<ScheduledJobRecord | null>(null)
    const [createAgentId, setCreateAgentId] = useState('')
    const [runs, setRuns] = useState<ScheduleSessionInfo[]>([])
    const [runsLoading, setRunsLoading] = useState(false)
    const [showModal, setShowModal] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [drafts, setDrafts] = useState<ScheduleDraftMap>(() => loadDrafts(draftsKey))
    const [form, setForm] = useState<FormState>({
        name: '',
        instruction: '',
        cron: DEFAULT_CRON,
    })

    const agentOptions = useMemo(() => (
        [
            {
                value: ALL_AGENTS,
                label: t('scheduler.allAgents'),
            },
            ...agents.map((agent) => ({
                value: agent.id,
                label: agent.name,
            })),
        ]
    ), [agents, t])

    const getDraftForJob = (job: ScheduledJobRecord) => drafts[job.agentId]?.[job.id]

    const getClientForJob = (job: ScheduledJobRecord) => getClient(job.agentId)

    const loadSchedules = async () => {
        if (agents.length === 0) {
            setJobs([])
            return
        }

        setLoading(true)
        try {
            if (selectedAgent === ALL_AGENTS) {
                const scheduleGroups = await Promise.all(
                    agents.map(async (agent) => {
                        const list = await getClient(agent.id).listSchedules()
                        return list.map((job) => ({
                            ...job,
                            agentId: agent.id,
                            agentName: agent.name,
                        }))
                    }),
                )
                setJobs(scheduleGroups.flat())
                return
            }

            const selectedAgentInfo = agents.find((agent) => agent.id === selectedAgent)
            if (!selectedAgentInfo) {
                setJobs([])
                return
            }

            const list = await getClient(selectedAgentInfo.id).listSchedules()
            setJobs(list.map((job) => ({
                ...job,
                agentId: selectedAgentInfo.id,
                agentName: selectedAgentInfo.name,
            })))
        } catch (err) {
            showToast('error', err instanceof Error ? err.message : 'Failed to load schedules')
        } finally {
            setLoading(false)
        }
    }

    const loadRuns = async (job: ScheduledJobRecord) => {
        setRunsLoading(true)
        try {
            const scheduleRuns = await getClientForJob(job).listScheduleSessions(job.id, 30)
            setRuns(scheduleRuns)
        } catch (err) {
            showToast('error', err instanceof Error ? err.message : 'Failed to load schedule runs')
        } finally {
            setRunsLoading(false)
        }
    }

    useEffect(() => {
        void loadSchedules()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAgent, agents])

    const getScheduleStatusLabel = (job: ScheduledJob) => {
        if (job.paused) return t('scheduler.paused')
        if (job.currently_running) return t('scheduler.running')
        return t('scheduler.active')
    }

    const filteredJobs = useMemo(() => {
        if (!searchTerm.trim()) return jobs

        const term = searchTerm.toLowerCase()
        return jobs.filter((job) =>
            job.id.toLowerCase().includes(term) ||
            job.agentName.toLowerCase().includes(term) ||
            job.cron.toLowerCase().includes(term) ||
            getScheduleStatusLabel(job).toLowerCase().includes(term) ||
            (getDraftForJob(job)?.instruction || '').toLowerCase().includes(term),
        )
    }, [jobs, searchTerm, drafts, t])

    // Auto-refresh schedule list every 15s (like official desktop UI)
    const loadSchedulesRef = useRef(loadSchedules)
    loadSchedulesRef.current = loadSchedules
    useEffect(() => {
        const id = setInterval(() => {
            if (!submitting) loadSchedulesRef.current()
        }, 15000)
        return () => clearInterval(id)
    }, [submitting])

    const openCreateModal = () => {
        if (agents.length === 0) {
            showToast('warning', t('common.noAgents'))
            return
        }
        setEditingJob(null)
        setRuns([])
        setCreateAgentId(selectedAgent === ALL_AGENTS ? (agents[0]?.id || '') : selectedAgent)
        setForm({ name: '', instruction: '', cron: DEFAULT_CRON })
        setShowModal(true)
    }

    const openEditModal = async (job: ScheduledJobRecord) => {
        setEditingJob(job)
        setCreateAgentId(job.agentId)
        const draft = getDraftForJob(job)
        setForm({
            name: draft?.name || job.id,
            instruction: draft?.instruction || '',
            cron: job.cron,
        })
        setShowModal(true)
        await loadRuns(job)
    }

    const handleSubmit = async () => {
        const targetAgentId = editingJob?.agentId || createAgentId || (selectedAgent === ALL_AGENTS ? '' : selectedAgent)
        if (!targetAgentId) return

        const targetClient = getClient(targetAgentId)
        if (!isCronLikelyValid(form.cron)) {
            showToast('warning', 'Cron expression must have 5 or 6 fields')
            return
        }

        const cleanedName = slugify(form.name)
        if (!cleanedName) {
            showToast('warning', 'Name is required')
            return
        }
        if (!form.instruction.trim()) {
            showToast('warning', 'Instruction is required')
            return
        }

        setSubmitting(true)
        try {
            const existingIds = new Set(jobs.filter(job => job.agentId === targetAgentId).map(job => job.id))
            const scheduleId = editingJob
                ? (cleanedName === editingJob.id ? cleanedName : ensureUniqueId(cleanedName, existingIds))
                : ensureUniqueId(cleanedName, existingIds)

            const recipe = {
                title: form.name.trim(),
                description: `Scheduled action: ${form.name.trim()}`,
                instructions: form.instruction.trim(),
            }

            if (editingJob) {
                const original = jobs.find(job => job.agentId === targetAgentId && job.id === editingJob.id)
                const wasPaused = !!original?.paused

                if (scheduleId === editingJob.id) {
                    await targetClient.deleteSchedule(editingJob.id)
                    await targetClient.createSchedule({ id: scheduleId, recipe, cron: form.cron.trim() })
                } else {
                    await targetClient.createSchedule({ id: scheduleId, recipe, cron: form.cron.trim() })
                    await targetClient.deleteSchedule(editingJob.id)
                }

                if (wasPaused) {
                    await targetClient.pauseSchedule(scheduleId)
                }
                showToast('success', 'Scheduled action updated')
            } else {
                await targetClient.createSchedule({ id: scheduleId, recipe, cron: form.cron.trim() })
                showToast('success', 'Scheduled action created')
            }

            const nextDrafts: ScheduleDraftMap = {
                ...drafts,
                [targetAgentId]: {
                    ...(drafts[targetAgentId] || {}),
                    [scheduleId]: {
                        name: form.name.trim(),
                        instruction: form.instruction.trim(),
                    },
                },
            }
            setDrafts(nextDrafts)
            saveDrafts(draftsKey, nextDrafts)

            if (editingJob) {
                await loadRuns({ ...editingJob, id: scheduleId })
            }
            setShowModal(false)
            await loadSchedules()
        } catch (err) {
            showToast('error', err instanceof Error ? err.message : 'Operation failed')
        } finally {
            setSubmitting(false)
        }
    }

    const handlePause = async (job: ScheduledJobRecord) => {
        try {
            await getClientForJob(job).pauseSchedule(job.id)
            showToast('success', `Paused ${job.id}`)
            await loadSchedules()
            if (editingJob?.id === job.id && editingJob.agentId === job.agentId) {
                setEditingJob({ ...job, paused: true, currently_running: false })
            }
        } catch (err) {
            showToast('error', err instanceof Error ? err.message : 'Operation failed')
        }
    }

    const handleUnpause = async (job: ScheduledJobRecord) => {
        try {
            await getClientForJob(job).unpauseSchedule(job.id)
            showToast('success', `Unpaused ${job.id}`)
            await loadSchedules()
            if (editingJob?.id === job.id && editingJob.agentId === job.agentId) {
                setEditingJob({ ...job, paused: false, currently_running: false })
            }
        } catch (err) {
            showToast('error', err instanceof Error ? err.message : 'Operation failed')
        }
    }

    const handleKill = async (job: ScheduledJobRecord) => {
        try {
            await getClientForJob(job).killSchedule(job.id)
            showToast('success', `Killed ${job.id}`)
            await loadSchedules()
            if (editingJob?.id === job.id && editingJob.agentId === job.agentId) {
                setEditingJob({ ...job, currently_running: false })
            }
        } catch (err) {
            showToast('error', err instanceof Error ? err.message : 'Operation failed')
        }
    }

    const handleRunNow = async (job: ScheduledJobRecord) => {
        try {
            const sessionId = await getClientForJob(job).runScheduleNow(job.id)
            showToast('success', sessionId === 'CANCELLED' ? `Run cancelled for ${job.id}` : `Triggered ${job.id}`)
            await loadSchedules()
            await loadRuns(job)
        } catch (err) {
            showToast('error', err instanceof Error ? err.message : 'Operation failed')
        }
    }

    const handleDelete = async (job: ScheduledJobRecord) => {
        const confirmed = window.confirm(`Delete scheduled action "${job.id}"?`)
        if (!confirmed) return
        try {
            await getClientForJob(job).deleteSchedule(job.id)
            showToast('success', `Deleted ${job.id}`)
            if (editingJob?.id === job.id && editingJob.agentId === job.agentId) {
                setShowModal(false)
                setEditingJob(null)
                setRuns([])
            }
            await loadSchedules()
        } catch (err) {
            showToast('error', err instanceof Error ? err.message : 'Delete failed')
        }
    }

    const handleOpenRunSession = (job: ScheduledJobRecord, sessionId: string) => {
        markSessionRead(job.agentId, sessionId)
        navigate(`/chat?sessionId=${sessionId}&agent=${job.agentId}`)
    }

    return (
        <div className="page-container sidebar-top-page scheduled-page">
            <PageHeader
                title={t('scheduler.title')}
                subtitle={t('scheduler.subtitle')}
                action={(
                    <button type="button" className="btn btn-primary" onClick={openCreateModal}>
                        {t('scheduler.createAction')}
                    </button>
                )}
            />
            <div className="scheduled-toolbar">
                <FilterBar
                    primary={(
                        <FilterInlineGroup>
                            <ListSearchInput
                                value={searchTerm}
                                placeholder={t('scheduler.searchPlaceholder')}
                                onChange={setSearchTerm}
                            />
                            <FilterSelect
                                value={selectedAgent}
                                options={agentOptions}
                                onChange={setSelectedAgent}
                                disabled={agents.length === 0}
                            />
                        </FilterInlineGroup>
                    )}
                />
            </div>

            {error && <div className="conn-banner conn-banner-error">{t('common.connectionError', { error })}</div>}
            {!isConnected && !error && <div className="conn-banner conn-banner-warning">{t('common.connectingGateway')}</div>}

            {loading ? (
                <div className="empty-state">
                    <h3 className="empty-state-title">{t('scheduler.loadingSchedules')}</h3>
                </div>
            ) : jobs.length === 0 ? (
                <div className="empty-state">
                    <h3 className="empty-state-title">{t('scheduler.noSchedules')}</h3>
                    <p className="empty-state-description">{t('scheduler.noSchedulesHint')}</p>
                </div>
            ) : searchTerm && filteredJobs.length === 0 ? (
                <div className="empty-state">
                    <h3 className="empty-state-title">{t('common.noResults')}</h3>
                    <p className="empty-state-description">{t('scheduler.noMatchSchedules', { term: searchTerm })}</p>
                </div>
            ) : (
                <CardWorkbench>
                    <CardGrid className="scheduled-grid">
                        {filteredJobs.map(job => (
                            <ResourceCard
                                key={`${job.agentId}:${job.id}`}
                                className="scheduled-card"
                                title={job.id}
                                statusLabel={getScheduleStatusLabel(job)}
                                statusTone={getScheduleStatusTone(job)}
                                tags={(
                                    <div className="resource-card-tags">
                                        <span className="resource-card-tag" title={job.agentName}>
                                            {job.agentName}
                                        </span>
                                    </div>
                                )}
                                summary={(
                                    <div className="resource-card-summary-stack">
                                        <p className="resource-card-summary-text resource-card-summary-code" title={job.cron}>
                                            {job.cron}
                                        </p>
                                        <p className={['resource-card-summary-text', !getDraftForJob(job)?.instruction ? 'resource-card-summary-placeholder' : ''].filter(Boolean).join(' ')}>
                                            {getDraftForJob(job)?.instruction || t('scheduler.summaryUnavailable')}
                                        </p>
                                    </div>
                                )}
                                metrics={[
                                    { label: t('scheduler.cron'), value: job.cron, valueClassName: 'scheduled-card-code' },
                                    { label: t('scheduler.lastRun'), value: job.last_run ? new Date(job.last_run).toLocaleString() : t('scheduler.never') },
                                ]}
                                footer={(
                                    <>
                                        <button type="button" className="resource-card-danger-action" onClick={() => handleDelete(job)}>
                                            {t('common.delete')}
                                        </button>
                                        <button type="button" className="resource-card-primary-action scheduled-card-primary-action" onClick={() => void openEditModal(job)}>
                                            {t('scheduler.configure')}
                                        </button>
                                    </>
                                )}
                            />
                        ))}
                    </CardGrid>
                </CardWorkbench>
            )}

            {showModal && (
                <DetailDialog
                    title={editingJob ? t('scheduler.editAction') : t('scheduler.createAction')}
                    onClose={() => setShowModal(false)}
                    variant="default"
                    className="scheduled-modal"
                    bodyClassName="scheduled-modal-body"
                    footer={(
                        <>
                            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={submitting}>
                                {t('common.cancel')}
                            </button>
                            <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting || (!editingJob && !createAgentId)}>
                                {submitting ? t('scheduler.saving') : (editingJob ? t('common.save') : t('scheduler.create'))}
                            </button>
                        </>
                    )}
                >
                    {!editingJob && (
                        <label className="scheduled-field-label">
                            {t('scheduler.agent')}
                            <select
                                className="scheduled-input"
                                value={createAgentId}
                                onChange={(e) => setCreateAgentId(e.target.value)}
                            >
                                {agents.map((agent) => (
                                    <option key={agent.id} value={agent.id}>
                                        {agent.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    <label className="scheduled-field-label">
                        {t('scheduler.name')}
                        <input
                            className="scheduled-input"
                            value={form.name}
                            onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="daily-summary-job"
                        />
                    </label>
                    <label className="scheduled-field-label">
                        {t('scheduler.instruction')}
                        <textarea
                            className="scheduled-textarea"
                            value={form.instruction}
                            onChange={(e) => setForm(prev => ({ ...prev, instruction: e.target.value }))}
                            placeholder={editingJob ? t('scheduler.instructionPlaceholderEdit') : t('scheduler.instructionPlaceholderNew')}
                            rows={5}
                        />
                    </label>

                    {editingJob && <div className="scheduled-editing-id">{t('scheduler.currentScheduleId', { id: editingJob.id })}</div>}

                    <label className="scheduled-field-label">
                        {t('scheduler.cron')}
                        <input
                            className="scheduled-input"
                            value={form.cron}
                            onChange={(e) => setForm(prev => ({ ...prev, cron: e.target.value }))}
                            placeholder="0 0 9 * * *"
                        />
                    </label>
                    <p className="scheduled-hint">{t('scheduler.cronHint')}</p>

                    {editingJob && (
                        <div className="scheduled-modal-section">
                            <div className="scheduled-modal-section-header">
                                <h4 className="scheduled-modal-section-title">{t('scheduler.manageTitle')}</h4>
                                <div className="resource-card-tags">
                                    <span className="resource-card-tag" title={editingJob.agentName}>
                                        {editingJob.agentName}
                                    </span>
                                    <span className={`resource-status resource-status-${getScheduleStatusTone(editingJob)}`}>
                                        {getScheduleStatusLabel(editingJob)}
                                    </span>
                                </div>
                            </div>

                            <div className="scheduled-detail-actions">
                                {!editingJob.currently_running ? (
                                    <>
                                        {editingJob.paused ? (
                                            <button type="button" className="btn btn-secondary" onClick={() => void handleUnpause(editingJob)}>
                                                {t('scheduler.resume')}
                                            </button>
                                        ) : (
                                            <button type="button" className="btn btn-secondary" onClick={() => void handlePause(editingJob)}>
                                                {t('scheduler.pause')}
                                            </button>
                                        )}
                                        <button type="button" className="btn btn-primary" onClick={() => void handleRunNow(editingJob)}>
                                            {t('scheduler.runNow')}
                                        </button>
                                    </>
                                ) : (
                                    <button type="button" className="btn btn-secondary" onClick={() => void handleKill(editingJob)}>
                                        {t('scheduler.kill')}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {editingJob && (
                        <div className="scheduled-modal-section">
                            <div className="scheduled-modal-section-header">
                                <h4 className="scheduled-modal-section-title">{t('scheduler.recentRuns')}</h4>
                            </div>
                            {runsLoading ? (
                                <div className="empty-state">
                                    <h3 className="empty-state-title">{t('scheduler.loadingRuns')}</h3>
                                </div>
                            ) : runs.length === 0 ? (
                                <div className="empty-state">
                                    <h3 className="empty-state-title">{t('scheduler.noRuns')}</h3>
                                    <p className="empty-state-description">{t('scheduler.noRunsHint')}</p>
                                </div>
                            ) : (
                                <div className="scheduled-runs-list">
                                    {runs.map(run => (
                                        <div key={run.id} className="scheduled-run-item">
                                            <div className="scheduled-run-main">
                                                <div className="scheduled-run-name">{run.name || run.id}</div>
                                                <div className="scheduled-run-meta">
                                                    <span>{new Date(run.createdAt).toLocaleString()}</span>
                                                    <span>{run.messageCount} {t('common.messages')}</span>
                                                    {run.totalTokens !== undefined && run.totalTokens !== null && (
                                                        <span>{run.totalTokens.toLocaleString()} {t('common.tokens')}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                className="btn btn-secondary"
                                                onClick={() => handleOpenRunSession(editingJob, run.id)}
                                            >
                                                {t('scheduler.openSession')}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </DetailDialog>
            )}
        </div>
    )
}
