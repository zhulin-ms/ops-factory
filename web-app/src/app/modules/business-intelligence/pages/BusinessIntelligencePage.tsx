import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BUSINESS_INTELLIGENCE_SERVICE_URL } from '../../../../config/runtime'
import { useToast } from '../../../../contexts/ToastContext'
import '../styles/business-intelligence.css'

interface TabMeta {
    id: string
    label: string
}

interface ExecutiveHero {
    score: string
    grade: string
    summary: string
    changeHint: string
    periodLabel: string
}

interface ProcessHealth {
    id: string
    label: string
    score: string
    tone: string
    summary: string
}

interface ExecutiveRisk {
    id: string
    priority: string
    title: string
    impact: string
    process: string
    value: string
}

interface RiskSummary {
    critical: number
    warning: number
    attention: number
    topRisks: ExecutiveRisk[]
}

interface TrendPoint {
    label: string
    score: number
    signal: number
}

interface TrendSection {
    title: string
    subtitle: string
    points: TrendPoint[]
}

interface ExecutiveSummary {
    hero: ExecutiveHero
    processHealths: ProcessHealth[]
    riskSummary: RiskSummary
    trend: TrendSection
}

interface MetricCard {
    id: string
    label: string
    value: string
    tone: string
}

interface ChartDatum {
    label: string
    value: number
}

interface ChartSection {
    id: string
    title: string
    type: string
    items: ChartDatum[]
}

interface TableSection {
    id: string
    title: string
    columns: string[]
    rows: string[][]
}

interface TabContent {
    id: string
    label: string
    description: string
    executiveSummary: ExecutiveSummary | null
    slaAnalysis: unknown | null
    cards: MetricCard[]
    charts: ChartSection[]
    tables: TableSection[]
}

interface OverviewResponse {
    refreshedAt: string
    tabs: TabMeta[]
    tabContents: Record<string, TabContent>
}

const BUSINESS_INTELLIGENCE_TAB_LABEL_KEYS: Record<string, string> = {
    'executive-summary': 'businessIntelligence.tabs.executiveSummary',
    'sla-analysis': 'businessIntelligence.tabs.slaAnalysis',
    'event-analysis': 'businessIntelligence.tabs.eventAnalysis',
    'incident-analysis': 'businessIntelligence.tabs.eventAnalysis',
    'change-analysis': 'businessIntelligence.tabs.changeAnalysis',
    'request-analysis': 'businessIntelligence.tabs.requestAnalysis',
    'problem-analysis': 'businessIntelligence.tabs.problemAnalysis',
    'cross-process-correlation': 'businessIntelligence.tabs.crossProcessCorrelation',
    'cross-process-analysis': 'businessIntelligence.tabs.crossProcessCorrelation',
    'personnel-efficiency': 'businessIntelligence.tabs.personnelEfficiency',
}

const BUSINESS_INTELLIGENCE_TAB_LABEL_FALLBACK_KEYS: Record<string, string> = {
    '执行摘要': 'businessIntelligence.tabs.executiveSummary',
    'sla分析': 'businessIntelligence.tabs.slaAnalysis',
    '事件分析': 'businessIntelligence.tabs.eventAnalysis',
    '变更分析': 'businessIntelligence.tabs.changeAnalysis',
    '请求分析': 'businessIntelligence.tabs.requestAnalysis',
    '问题分析': 'businessIntelligence.tabs.problemAnalysis',
    '跨流程关联': 'businessIntelligence.tabs.crossProcessCorrelation',
    '人员与效率': 'businessIntelligence.tabs.personnelEfficiency',
}

function getBusinessIntelligenceTabLabel(tab: TabMeta, t: (key: string) => string): string {
    const keyById = BUSINESS_INTELLIGENCE_TAB_LABEL_KEYS[tab.id]
    if (keyById) {
        return t(keyById)
    }

    const normalizedLabel = tab.label.trim().toLowerCase()
    const keyByLabel = BUSINESS_INTELLIGENCE_TAB_LABEL_FALLBACK_KEYS[normalizedLabel] ?? BUSINESS_INTELLIGENCE_TAB_LABEL_FALLBACK_KEYS[tab.label.trim()]
    if (keyByLabel) {
        return t(keyByLabel)
    }

    return tab.label
}

function ExecutiveSummaryPanel({
    summary,
    t,
}: {
    summary: ExecutiveSummary
    cards: MetricCard[]
    t: (key: string, options?: Record<string, unknown>) => string
}) {
    const totalRisks = summary.riskSummary.critical + summary.riskSummary.warning + summary.riskSummary.attention

    return (
        <div className="business-intelligence-dashboard-shell">
            <div className="business-intelligence-dashboard-stats">
                <section className="mon-kpi-card business-intelligence-dashboard-stat-card">
                    <span className="mon-kpi-label">{t('businessIntelligence.dashboard.healthScoreLabel')}</span>
                    <strong className="mon-kpi-value">{summary.hero.score}</strong>
                    <p className="mon-kpi-sub">{t('businessIntelligence.dashboard.healthScoreDescription')}</p>
                </section>
                <section className="mon-kpi-card business-intelligence-dashboard-stat-card">
                    <span className="mon-kpi-label">{t('businessIntelligence.dashboard.totalRisksLabel')}</span>
                    <strong className="mon-kpi-value">{t('businessIntelligence.dashboard.totalRisksValue', { count: totalRisks })}</strong>
                    <p className="mon-kpi-sub">{t('businessIntelligence.dashboard.totalRisksDescription')}</p>
                </section>
            </div>

            <div className="business-intelligence-dashboard-grid">
                <section className="mon-kpi-card business-intelligence-dashboard-panel business-intelligence-dashboard-panel-primary">
                    <div className="mon-chart-card-head business-intelligence-dashboard-panel-header">
                        <div className="mon-chart-card-meta">
                            <h3>{t('businessIntelligence.dashboard.overviewTitle')}</h3>
                            <p className="mon-chart-subtitle">{t('businessIntelligence.dashboard.overviewDescription')}</p>
                        </div>
                    </div>
                    <div className="business-intelligence-dashboard-panel-body business-intelligence-dashboard-panel-body-tall" />
                </section>

                <div className="business-intelligence-dashboard-side">
                    <section className="mon-kpi-card business-intelligence-dashboard-panel">
                        <div className="mon-chart-card-head business-intelligence-dashboard-panel-header">
                            <div className="mon-chart-card-meta">
                                <h3>{t('businessIntelligence.dashboard.evidenceTitle')}</h3>
                                <p className="mon-chart-subtitle">{t('businessIntelligence.dashboard.evidenceDescription')}</p>
                            </div>
                        </div>
                        <div className="business-intelligence-dashboard-panel-body" />
                    </section>

                    <section className="mon-kpi-card business-intelligence-dashboard-panel">
                        <div className="mon-chart-card-head business-intelligence-dashboard-panel-header">
                            <div className="mon-chart-card-meta">
                                <h3>{t('businessIntelligence.dashboard.risksTitle')}</h3>
                                <p className="mon-chart-subtitle">{t('businessIntelligence.dashboard.risksDescription')}</p>
                            </div>
                        </div>
                        <div className="business-intelligence-dashboard-panel-body" />
                    </section>
                </div>
            </div>

            <section className="mon-kpi-card business-intelligence-dashboard-panel business-intelligence-dashboard-panel-wide">
                <div className="mon-chart-card-head business-intelligence-dashboard-panel-header">
                    <div className="mon-chart-card-meta">
                        <h3>{t('businessIntelligence.dashboard.governanceTitle')}</h3>
                        <p className="mon-chart-subtitle">{t('businessIntelligence.dashboard.governanceDescription')}</p>
                    </div>
                </div>
                <div className="business-intelligence-dashboard-panel-body business-intelligence-dashboard-panel-body-wide" />
            </section>
        </div>
    )
}

export default function BusinessIntelligence() {
    const { t } = useTranslation()
    const { showToast } = useToast()
    const [overview, setOverview] = useState<OverviewResponse | null>(null)
    const [activeTabId, setActiveTabId] = useState<string>('executive-summary')
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const loadOverview = useCallback(async (options?: { forceRefresh?: boolean }) => {
        const forceRefresh = options?.forceRefresh === true
        if (forceRefresh) {
            setRefreshing(true)
        } else {
            setLoading(true)
        }
        setError(null)
        try {
            const response = await fetch(`${BUSINESS_INTELLIGENCE_SERVICE_URL}/${forceRefresh ? 'refresh' : 'overview'}`, {
                method: forceRefresh ? 'POST' : 'GET',
            })

            const contentType = response.headers.get('content-type') || ''
            const isJson = contentType.includes('application/json')

            if (!response.ok) {
                if (!isJson) {
                    throw new Error(t('businessIntelligence.serviceUnavailable', {
                        status: response.status,
                        statusText: response.statusText,
                    }))
                }

                const errorPayload = await response.json().catch(() => null) as { message?: string } | null
                throw new Error(errorPayload?.message || `${response.status} ${response.statusText}`)
            }

            if (!isJson) {
                throw new Error(t('businessIntelligence.invalidJsonResponse'))
            }

            const data = await response.json() as OverviewResponse
            setOverview(data)
            setActiveTabId(current => (data.tabs.length > 0 && !data.tabs.some(tab => tab.id === current) ? data.tabs[0].id : current))
            if (forceRefresh) {
                showToast('success', t('businessIntelligence.refreshSuccess'))
            }
        } catch (requestError) {
            const message = requestError instanceof Error ? requestError.message : t('common.unknownError')
            setError(message)
            if (forceRefresh) {
                showToast('error', t('businessIntelligence.refreshFailed', { error: message }))
            }
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }, [showToast, t])

    useEffect(() => {
        void loadOverview()
    }, [loadOverview])

    const activeTab = useMemo(() => {
        if (!overview) return null
        return overview.tabContents[activeTabId] || overview.tabContents[overview.tabs[0]?.id || ''] || null
    }, [activeTabId, overview])

    return (
        <div className="page-container sidebar-top-page resource-page business-intelligence-page">
            <div className="page-header">
                <div className="business-intelligence-toolbar">
                    <div>
                        <h1 className="page-title">{t('businessIntelligence.title')}</h1>
                        <p className="page-subtitle">{t('businessIntelligence.subtitle')}</p>
                    </div>
                    <div className="business-intelligence-toolbar-actions">
                        <div className="business-intelligence-header-meta" aria-label={t('businessIntelligence.reportingPeriod')}>
                            <span className="business-intelligence-header-meta-label">{t('businessIntelligence.reportingPeriod')}</span>
                            <span className="business-intelligence-header-meta-value">{activeTab?.executiveSummary?.hero.periodLabel || '—'}</span>
                        </div>
                        <button
                            type="button"
                            className="btn btn-secondary business-intelligence-refresh-button"
                            onClick={() => void loadOverview({ forceRefresh: true })}
                            disabled={refreshing}
                            aria-label={refreshing ? t('businessIntelligence.refreshing') : t('businessIntelligence.refresh')}
                            title={refreshing ? t('businessIntelligence.refreshing') : t('businessIntelligence.refresh')}
                        >
                            <RefreshCw size={15} className={refreshing ? 'business-intelligence-refresh-icon spinning' : 'business-intelligence-refresh-icon'} />
                        </button>
                    </div>
                </div>
            </div>

            {error ? (
                <div className="conn-banner conn-banner-error">
                    {t('common.connectionError', { error })}
                </div>
            ) : null}

            {loading ? (
                <div className="empty-state">
                    <div className="empty-state-title">{t('common.loading')}</div>
                    <div className="empty-state-description">{t('businessIntelligence.loadingDescription')}</div>
                </div>
            ) : overview && activeTab ? (
                <>
                    <div className="config-tabs" role="tablist" aria-label={t('businessIntelligence.tabsLabel')}>
                        {overview.tabs.map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={tab.id === activeTab.id}
                                className={`config-tab ${tab.id === activeTab.id ? 'config-tab-active' : ''}`}
                                onClick={() => setActiveTabId(tab.id)}
                            >
                                {getBusinessIntelligenceTabLabel(tab, t)}
                            </button>
                        ))}
                    </div>

                    {activeTab.id === 'executive-summary' && activeTab.executiveSummary ? (
                        <ExecutiveSummaryPanel summary={activeTab.executiveSummary} cards={activeTab.cards} t={t} />
                    ) : (
                        <section className="business-intelligence-content-card">
                            <div className="empty-state">
                                <div className="empty-state-title">{t('businessIntelligence.notImplemented')}</div>
                            </div>
                        </section>
                    )}
                </>
            ) : (
                <div className="empty-state">
                    <h3 className="empty-state-title">{t('businessIntelligence.emptyTitle')}</h3>
                    <p className="empty-state-description">{t('businessIntelligence.emptyDescription')}</p>
                </div>
            )}
        </div>
    )
}
