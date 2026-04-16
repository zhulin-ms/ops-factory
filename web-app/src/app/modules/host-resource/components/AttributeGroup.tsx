type Props = {
    title: string
    fields: Array<{ label: string; value: React.ReactNode }>
}

export default function AttributeGroup({ title, fields }: Props) {
    return (
        <div className="hr-attr-group">
            <h4 className="hr-attr-group-title">{title}</h4>
            <div className="hr-attr-group-fields">
                {fields.map(f => (
                    <div key={f.label} className="hr-attr-field">
                        <span className="hr-attr-label">{f.label}</span>
                        <span className="hr-attr-value">{f.value ?? '-'}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
