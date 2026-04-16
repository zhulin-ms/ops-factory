import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Button from '../../../platform/ui/primitives/Button'
import PageBackLink from '../../../platform/ui/primitives/PageBackLink'
import TextSurface from '../../../platform/ui/primitives/TextSurface'
import { useToast } from '../../../platform/providers/ToastContext'
import { useManagedServiceDetail } from '../hooks/useManagedServiceDetail'
import '../styles/control-center-detail.css'

type ServiceDetailTab = 'config' | 'logs'

export default function ManagedServiceDetailPage() {
    const { t } = useTranslation()
    const { serviceId } = useParams<{ serviceId: string }>()
    const navigate = useNavigate()
    const { showToast } = useToast()
    const { config, logs, isLoading, isSaving, error, load, fetchLogs, saveConfig } = useManagedServiceDetail()
    const [activeTab, setActiveTab] = useState<ServiceDetailTab>('config')
    const [draftConfig, setDraftConfig] = useState('')
    const [isEditing, setIsEditing] = useState(false)

    useEffect(() => {
        if (serviceId) {
            void load(serviceId)
        }
    }, [serviceId, load])

    useEffect(() => {
        if (config) {
            setDraftConfig(config.content)
        }
    }, [config])

    useEffect(() => {
        if (!config && logs && activeTab === 'config') {
            setActiveTab('logs')
            setIsEditing(false)
        }
    }, [activeTab, config, logs])

    const handleSave = async () => {
        if (!serviceId) return
        const result = await saveConfig(serviceId, draftConfig)
        if (result.success) {
            setIsEditing(false)
            showToast('success', t('controlCenter.configSaved'))
        } else {
            showToast('error', result.error || t('controlCenter.configSaveFailed'))
        }
    }

    const handleRefreshLogs = async () => {
        if (!serviceId) return
        try {
            await fetchLogs(serviceId)
            showToast('success', t('controlCenter.logsRefreshed'))
        } catch (refreshError) {
            showToast('error', refreshError instanceof Error ? refreshError.message : t('common.somethingWentWrong'))
        }
    }

    const serviceName = config?.serviceName || logs?.serviceName || serviceId || t('controlCenter.serviceDetailTitle')
    const handleDownloadLogs = () => {
        const content = logs?.content || ''
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `${serviceId || 'service'}-recent.log`
        anchor.click()
        URL.revokeObjectURL(url)
    }

    if (isLoading && !config && !logs) {
        return (
            <div className="page-container sidebar-top-page control-center-detail-page">
                <div className="control-center-detail-loading">{t('monitoring.loading')}</div>
            </div>
        )
    }

    return (
        <div className="page-container sidebar-top-page control-center-detail-page">
            <div className="control-center-detail-header">
                <PageBackLink onClick={() => navigate('/control-center')}>
                    {t('controlCenter.backToControlCenter')}
                </PageBackLink>
                <div className="control-center-detail-title-section">
                    <h1 className="control-center-detail-title">{serviceName}</h1>
                </div>
            </div>

            <div className="config-tabs">
                <button
                    type="button"
                    className={`config-tab ${activeTab === 'config' ? 'config-tab-active' : ''}`}
                    onClick={() => setActiveTab('config')}
                    disabled={!config}
                >
                    {t('controlCenter.detailTabConfig')}
                </button>
                <button
                    type="button"
                    className={`config-tab ${activeTab === 'logs' ? 'config-tab-active' : ''}`}
                    onClick={() => setActiveTab('logs')}
                >
                    {t('controlCenter.detailTabLogs')}
                </button>
            </div>

            {error && (
                <div className="conn-banner conn-banner-error">
                    {t('monitoring.errorLoading')}: {error}
                </div>
            )}

            {activeTab === 'config' && (
                <section className="control-center-detail-section">
                    <div className="control-center-detail-section-head">
                        <div>
                            <h2 className="control-center-detail-section-title">{t('controlCenter.configSectionTitle')}</h2>
                            <p className="control-center-detail-section-meta">{config?.path}</p>
                        </div>
                        <div className="control-center-detail-actions">
                            {!config ? null : !isEditing ? (
                                <Button variant="secondary" onClick={() => setIsEditing(true)}>
                                    {t('common.edit')}
                                </Button>
                            ) : (
                                <>
                                    <Button
                                        variant="secondary"
                                        onClick={() => {
                                            setDraftConfig(config?.content || '')
                                            setIsEditing(false)
                                        }}
                                        disabled={isSaving}
                                    >
                                        {t('common.cancel')}
                                    </Button>
                                    <Button variant="primary" onClick={() => void handleSave()} disabled={isSaving}>
                                        {isSaving ? t('common.saving') : t('common.save')}
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                    {config ? (
                        <TextSurface
                            className="control-center-detail-surface"
                            value={draftConfig}
                            onChange={(event) => setDraftConfig(event.target.value)}
                            readOnly={!isEditing}
                            spellCheck={false}
                        />
                    ) : (
                        <div className="mon-no-data">{t('controlCenter.configUnavailable')}</div>
                    )}
                </section>
            )}

            {activeTab === 'logs' && (
                <section className="control-center-detail-section">
                    <div className="control-center-detail-section-head">
                        <div>
                            <h2 className="control-center-detail-section-title">{t('controlCenter.logsSectionTitle')}</h2>
                            <p className="control-center-detail-section-meta">{logs?.path}</p>
                        </div>
                        <div className="control-center-detail-actions">
                            <Button variant="secondary" onClick={handleDownloadLogs}>
                                {t('controlCenter.downloadLogs')}
                            </Button>
                            <Button variant="secondary" onClick={() => void handleRefreshLogs()}>
                                {t('controlCenter.refreshLogs')}
                            </Button>
                        </div>
                    </div>
                    <TextSurface
                        className="control-center-detail-surface"
                        value={logs?.content || t('controlCenter.logsEmpty')}
                        readOnly
                        scrollToBottomOnChange
                    />
                </section>
            )}
        </div>
    )
}
