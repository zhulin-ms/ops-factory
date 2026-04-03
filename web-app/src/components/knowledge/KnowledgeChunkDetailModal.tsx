import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import DetailDialog from '../DetailDialog'

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
        <DetailDialog
            title={title}
            onClose={onClose}
            variant="wide"
            className={`knowledge-chunk-detail-modal ${widthClassName}`.trim()}
            bodyClassName="knowledge-chunk-detail-modal-body"
            footer={footer}
        >
            {(subtitle || headerMeta || badges.length > 0) ? (
                <div className="knowledge-chunk-detail-intro">
                    {subtitle ? (
                        <p className="knowledge-panel-description knowledge-chunk-detail-subtitle">{subtitle}</p>
                    ) : null}
                    {headerMeta ? (
                        <div className="knowledge-chunk-detail-header-meta">
                            {headerMeta}
                        </div>
                    ) : null}
                    {badges.length > 0 ? (
                        <div className="knowledge-chunk-detail-badges">
                            {badges.map(badge => (
                                <span key={badge} className="resource-card-tag">{badge}</span>
                            ))}
                        </div>
                    ) : null}
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
                <div className="knowledge-chunk-detail-body">
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
        </DetailDialog>
    )
}
