import { useTranslation } from 'react-i18next'

type TypeDef = {
    id: string
    name: string
    code: string
    description: string
    color: string
    knowledge: string
    createdAt: string
    updatedAt: string
}

type Props = {
    item: TypeDef
    onEdit: (item: TypeDef) => void
    onDelete: (item: TypeDef) => void
}

export default function TypeCard({ item, onEdit, onDelete }: Props) {
    const { t } = useTranslation()
    return (
        <div className="hr-type-def-card">
            <div className="hr-type-def-card-header">
                <span className="hr-type-def-card-color" style={{ background: item.color }} />
                <span className="hr-type-def-card-name">{item.name}</span>
            </div>
            {item.description && (
                <div className="hr-type-def-card-desc">{item.description}</div>
            )}
            {item.knowledge && (
                <>
                    <div className="hr-type-def-card-knowledge-label">{t('hostResource.knowledge')}</div>
                    <div className="hr-type-def-card-knowledge">{item.knowledge}</div>
                </>
            )}
            <div className="hr-type-def-card-footer">
                <button className="btn btn-secondary btn-sm" onClick={() => onEdit(item)}>
                    {t('common.edit')}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => onDelete(item)}>
                    {t('common.delete')}
                </button>
            </div>
        </div>
    )
}
