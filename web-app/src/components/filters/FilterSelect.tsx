import './FilterSelect.css'

interface FilterSelectOption {
    value: string
    label: string
}

interface FilterSelectProps {
    label?: string
    value: string
    options: FilterSelectOption[]
    onChange: (value: string) => void
    disabled?: boolean
}

export default function FilterSelect({
    label,
    value,
    options,
    onChange,
    disabled = false,
}: FilterSelectProps) {
    return (
        <label className="filter-select-field">
            {label ? <span className="filter-select-label">{label}</span> : null}
            <select
                className="filter-select"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                disabled={disabled}
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </label>
    )
}
