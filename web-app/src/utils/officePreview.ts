function parseCsvLike(input: string, delimiter: ',' | '\t'): string[][] {
    const rows: string[][] = []
    const normalized = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

    let row: string[] = []
    let value = ''
    let inQuote = false

    const pushCell = () => {
        row.push(value)
        value = ''
    }

    const pushRow = () => {
        if (row.length > 0 || value.length > 0) {
            pushCell()
            rows.push(row)
        }
        row = []
    }

    for (let i = 0; i < normalized.length; i += 1) {
        const char = normalized[i]

        if (char === '"') {
            const nextChar = normalized[i + 1]
            if (inQuote && nextChar === '"') {
                value += '"'
                i += 1
            } else {
                inQuote = !inQuote
            }
            continue
        }

        if (!inQuote && char === delimiter) {
            pushCell()
            continue
        }

        if (!inQuote && char === '\n') {
            pushRow()
            continue
        }

        value += char
    }

    pushRow()
    return rows
}

function toRectangularTable(rows: string[][]): string[][] {
    const maxColumns = rows.reduce((max, row) => Math.max(max, row.length), 0)
    return rows.map(row => {
        if (row.length === maxColumns) return row
        return [...row, ...new Array(maxColumns - row.length).fill('')]
    })
}

export function parseCsvTable(text: string, delimiter: ',' | '\t'): string[][] {
    return toRectangularTable(parseCsvLike(text, delimiter))
}
