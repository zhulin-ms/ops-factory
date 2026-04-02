import type { ReactNode } from 'react'
import './ResourceCard.css'

export type ResourceStatusTone = 'neutral' | 'configured' | 'success' | 'warning' | 'danger'

export interface ResourceCardMetric {
    label: string
    value: ReactNode
    valueClassName?: string
}

interface ResourceCardProps {
    className?: string
    title: string
    statusLabel?: string
    statusTone?: ResourceStatusTone
    summary?: ReactNode
    metrics: ResourceCardMetric[]
    footer?: ReactNode
}

function getMetricColumnClass(count: number): string {
    if (count <= 1) return 'columns-1'
    if (count === 2) return 'columns-2'
    return 'columns-3'
}

export default function ResourceCard({
    className,
    title,
    statusLabel,
    statusTone = 'neutral',
    summary,
    metrics,
    footer,
}: ResourceCardProps) {
    const cardClassName = ['resource-card', className].filter(Boolean).join(' ')
    const metricClassName = ['resource-card-metrics', getMetricColumnClass(metrics.length)].join(' ')

    return (
        <article className={cardClassName}>
            <div className="resource-card-header">
                <h3 className="resource-card-title" title={title}>
                    {title}
                </h3>
                {statusLabel && (
                    <span className={`resource-status resource-status-${statusTone}`}>
                        {statusLabel}
                    </span>
                )}
            </div>

            {summary && (
                <div className="resource-card-summary">
                    {summary}
                </div>
            )}

            <div className={metricClassName}>
                {metrics.map(metric => (
                    <div key={metric.label} className="resource-card-metric">
                        <span className="resource-card-metric-label">{metric.label}</span>
                        <span className={['resource-card-metric-value', metric.valueClassName].filter(Boolean).join(' ')}>
                            {metric.value}
                        </span>
                    </div>
                ))}
            </div>

            {footer && (
                <div className="resource-card-footer">
                    {footer}
                </div>
            )}
        </article>
    )
}
