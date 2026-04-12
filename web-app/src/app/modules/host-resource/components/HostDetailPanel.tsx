import { useTranslation } from 'react-i18next'
import type { Host, Cluster } from '../../../../types/host'
import AttributeGroup from './AttributeGroup'

type Props = {
    host: Host
    cluster?: Cluster | null
    onClose: () => void
    onEdit: () => void
}

export default function HostDetailPanel({ host, cluster, onClose, onEdit }: Props) {
    const { t } = useTranslation()

    return (
        <>
            <div className="hr-detail-panel-header">
                <h3>{host.name}</h3>
                <div className="hr-detail-panel-actions">
                    <button className="btn btn-secondary btn-sm" onClick={onEdit}>{t('common.edit')}</button>
                    <button className="btn btn-secondary btn-sm" onClick={onClose}>&times;</button>
                </div>
            </div>

            <AttributeGroup title={t('hostResource.basicInfo')} fields={[
                { label: t('hostResource.hostName'), value: host.name },
                { label: t('hostResource.hostname'), value: host.hostname },
                { label: 'IP', value: `${host.ip}:${host.port}` },
            ]} />

            <AttributeGroup title={t('hostResource.systemInfo')} fields={[
                { label: 'OS', value: host.os },
                { label: t('hostResource.location'), value: host.location },
            ]} />

            <AttributeGroup title={t('hostResource.authInfo')} fields={[
                { label: t('hostResource.username'), value: host.username },
                { label: t('hostResource.authType'), value: host.authType },
                { label: t('hostResource.credential'), value: host.credential ? '***' : '-' },
            ]} />

            <AttributeGroup title={t('hostResource.businessInfo')} fields={[
                { label: t('hostResource.cluster'), value: cluster ? `${cluster.name} (${cluster.type})` : '-' },
                { label: t('hostResource.purpose'), value: host.purpose },
                { label: t('hostResource.business'), value: host.business },
            ]} />

            {host.description && (
                <AttributeGroup title={t('hostResource.description')} fields={[
                    { label: '', value: host.description },
                ]} />
            )}

            {host.customAttributes && host.customAttributes.length > 0 && (
                <AttributeGroup
                    title={t('hostResource.customAttributes')}
                    fields={host.customAttributes.map(attr => ({
                        label: attr.key,
                        value: attr.value,
                    }))}
                />
            )}
        </>
    )
}
