import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

interface KnowledgeChunkDetailSidebarSection {
    key: string
    title: string
    content: ReactNode
    className?: string
}

interface KnowledgeChunkDetailModalProps {
    title: string
    subtitle?: string | null
    badges?: string[]
    headerMeta?: ReactNode
    notice?: ReactNode
    error?: string | null
    loading?: boolean
    loadingLabel?: string
    mainSectionTitle: string
    mainSectionContent: ReactNode
    sidebarSections: KnowledgeChunkDetailSidebarSection[]
    footer?: ReactNode
    onClose: () => void
    widthClassName?: string
}

export default function KnowledgeChunkDetailModal({
    title,
    subtitle,
    badges = [],
    headerMeta,
    notice,
    error,
    loading = false,
    loadingLabel,
    mainSectionTitle,
    mainSectionContent,
    sidebarSections,
    footer,
    onClose,
    widthClassName = '',
}: KnowledgeChunkDetailModalProps) {
    const { t } = useTranslation()

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className={`modal knowledge-chunk-detail-modal ${widthClassName}`.trim()}
                onClick={event => event.stopPropagation()}
            >
                <div className="modal-header knowledge-panel-header knowledge-chunk-detail-header">
                    <div className="knowledge-chunk-detail-header-copy">
                        <h3 className="knowledge-panel-title knowledge-chunk-detail-title">{title}</h3>
                        {subtitle ? (
                            <p className="knowledge-panel-description knowledge-chunk-detail-subtitle">{subtitle}</p>
                        ) : null}
                        {headerMeta ? (
                            <div className="knowledge-chunk-detail-header-meta">
                                {headerMeta}
                            </div>
                        ) : null}
                    </div>
                    <button type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}>
                        &times;
                    </button>
                </div>

                {badges.length > 0 ? (
                    <div className="knowledge-chunk-detail-badges">
                        {badges.map(badge => (
                            <span key={badge} className="resource-card-tag">{badge}</span>
                        ))}
                    </div>
                ) : null}

                {error ? (
                    <div className="agents-alert agents-alert-error">{error}</div>
                ) : null}

                {notice ? (
                    <div className="knowledge-chunk-detail-notice">
                        {notice}
                    </div>
                ) : null}

                {loading ? (
                    <div className="knowledge-doc-empty">{loadingLabel || t('common.loading')}</div>
                ) : (
                    <div className="modal-body knowledge-chunk-detail-modal-body knowledge-chunk-detail-body">
                        <div className="knowledge-chunk-detail-main">
                            <section className="knowledge-chunk-detail-section knowledge-chunk-detail-section-content">
                                <h4 className="knowledge-chunk-detail-section-title">{mainSectionTitle}</h4>
                                <div className="knowledge-chunk-detail-section-body">
                                    {mainSectionContent}
                                </div>
                            </section>
                        </div>
                        <aside className="knowledge-chunk-detail-sidebar">
                            {sidebarSections.map(section => (
                                <section
                                    key={section.key}
                                    className={`knowledge-chunk-detail-section knowledge-chunk-detail-sidebar-section ${section.className || ''}`.trim()}
                                >
                                    <h4 className="knowledge-chunk-detail-section-title">{section.title}</h4>
                                    <div className="knowledge-chunk-detail-section-body">
                                        {section.content}
                                    </div>
                                </section>
                            ))}
                        </aside>
                    </div>
                )}

                {footer ? (
                    <div className="modal-footer knowledge-chunk-detail-footer">
                        {footer}
                    </div>
                ) : null}
            </div>
        </div>
    )
}
