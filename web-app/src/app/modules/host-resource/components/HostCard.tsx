import { useTranslation } from 'react-i18next'
import type { Host, Cluster } from '../../../../types/host'

function TrashIcon() {
    return (
        <svg viewBox="0 0 20 20" fill="none" width="16" height="16" aria-hidden="true">
            <path
                d="M6.5 5.5h7m-6 0V4.75A1.75 1.75 0 0 1 9.25 3h1.5A1.75 1.75 0 0 1 12.5 4.75v.75m-8 0h11m-1 0-.6 8.39a1.75 1.75 0 0 1-1.75 1.61H7.85A1.75 1.75 0 0 1 6.1 13.89L5.5 5.5m2.75 2.5v4m4-4v4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    )
}

type Props = {
    host: Host
    cluster?: Cluster
    selected?: boolean
    testing?: boolean
    testResult?: { ok: boolean; msg: string } | null
    onClick: () => void
    onEdit: () => void
    onDelete: () => void
    onTest?: () => void
}

export default function HostCard({ host, cluster, selected, testing, testResult, onClick, onEdit, onDelete, onTest }: Props) {
    const { t } = useTranslation()

    return (
        <div
            className={`hr-host-card ${selected ? 'hr-host-card-selected' : ''}`}
            onClick={onClick}
        >
            <div className="hr-host-card-header">
                <div className="hr-host-card-title-row">
                    <h3 className="hr-host-card-name">{host.name}</h3>
                    {host.description && (
                        <span className="hr-host-card-desc">{host.description}</span>
                    )}
                </div>
            </div>

            <div className="hr-host-card-meta">
                <div className="hr-host-card-meta-field">
                    <span className="hr-host-card-meta-label">{t('hostResource.ipPort')}</span>
                    <span className="hr-host-card-meta-value hr-host-card-mono">{host.ip}:{host.port}</span>
                    {testResult && (
                        <span className={`hr-test-badge ${testResult.ok ? 'hr-test-ok' : 'hr-test-fail'}`}>
                            {testResult.ok ? 'OK' : 'FAIL'}
                        </span>
                    )}
                </div>
                {host.os && (
                    <div className="hr-host-card-meta-field">
                        <span className="hr-host-card-meta-label">{t('hostResource.os')}</span>
                        <span className="hr-host-card-meta-value">{host.os}</span>
                    </div>
                )}
                {host.location && (
                    <div className="hr-host-card-meta-field">
                        <span className="hr-host-card-meta-label">{t('hostResource.location')}</span>
                        <span className="hr-host-card-meta-value">{host.location}</span>
                    </div>
                )}
                {cluster && (
                    <div className="hr-host-card-meta-field">
                        <span className="hr-host-card-meta-label">{t('hostResource.clusterName')}</span>
                        <span className="hr-host-card-meta-value">{cluster.name}</span>
                    </div>
                )}
                {host.purpose && (
                    <div className="hr-host-card-meta-field">
                        <span className="hr-host-card-meta-label">{t('hostResource.purpose')}</span>
                        <span className="hr-host-card-meta-value">{host.purpose}</span>
                    </div>
                )}
                {host.business && (
                    <div className="hr-host-card-meta-field">
                        <span className="hr-host-card-meta-label">{t('hostResource.business')}</span>
                        <span className="hr-host-card-meta-value">{host.business}</span>
                    </div>
                )}
            </div>

            <div className="hr-host-card-footer" onClick={e => e.stopPropagation()}>
                {onTest && (
                    <button className="btn btn-subtle btn-sm" onClick={onTest} disabled={testing}>
                        {testing ? t('remoteDiagnosis.hosts.testing') : t('remoteDiagnosis.hosts.testConnection')}
                    </button>
                )}
                <button className="btn btn-subtle btn-sm" onClick={onEdit}>
                    {t('common.edit')}
                </button>
                <button
                    className="hr-host-card-delete-btn"
                    onClick={onDelete}
                    aria-label={t('common.delete')}
                >
                    <TrashIcon />
                </button>
            </div>
        </div>
    )
}
