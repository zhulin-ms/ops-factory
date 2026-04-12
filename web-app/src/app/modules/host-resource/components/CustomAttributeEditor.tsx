import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { CustomAttribute } from '../../../../types/host'

type Props = {
    attributes: CustomAttribute[]
    onChange: (attrs: CustomAttribute[]) => void
}

export default function CustomAttributeEditor({ attributes, onChange }: Props) {
    const { t } = useTranslation()

    const handleAdd = useCallback(() => {
        onChange([...attributes, { key: '', value: '' }])
    }, [attributes, onChange])

    const handleRemove = useCallback((index: number) => {
        onChange(attributes.filter((_, i) => i !== index))
    }, [attributes, onChange])

    const handleChange = useCallback((index: number, field: 'key' | 'value', val: string) => {
        const updated = attributes.map((attr, i) =>
            i === index ? { ...attr, [field]: val } : attr
        )
        onChange(updated)
    }, [attributes, onChange])

    return (
        <div className="hr-custom-attrs">
            <div className="hr-custom-attrs-header">
                <label className="form-label">{t('hostResource.customAttributes')}</label>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleAdd}>
                    + {t('hostResource.addAttribute')}
                </button>
            </div>
            {attributes.map((attr, index) => (
                <div key={index} className="hr-custom-attr-row">
                    <input
                        className="form-input hr-attr-key"
                        placeholder={t('hostResource.attrKey')}
                        value={attr.key}
                        onChange={e => handleChange(index, 'key', e.target.value)}
                    />
                    <input
                        className="form-input hr-attr-value"
                        placeholder={t('hostResource.attrValue')}
                        value={attr.value}
                        onChange={e => handleChange(index, 'value', e.target.value)}
                    />
                    <button
                        type="button"
                        className="btn btn-danger btn-sm hr-attr-remove"
                        onClick={() => handleRemove(index)}
                    >
                        &times;
                    </button>
                </div>
            ))}
        </div>
    )
}
