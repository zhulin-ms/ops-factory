export function getFileCitationDisplayPath(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/')
    const dataMarker = '/data/'
    const dataIndex = normalized.lastIndexOf(dataMarker)

    if (dataIndex >= 0) {
        return normalized.slice(dataIndex + dataMarker.length)
    }

    const segments = normalized.split('/').filter(Boolean)
    if (segments.length <= 3) {
        return segments.join('/')
    }

    return segments.slice(-3).join('/')
}

export function sanitizeFileCitationSnippet(snippet: string | null | undefined): string | null {
    const normalized = (snippet || '')
        .replace(/\r?\n+/g, ' ')
        .replace(/\|+/g, ' ')
        .replace(/\[\[|\]\]/g, ' ')
        .replace(/[\[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    return normalized.length > 0 ? normalized : null
}
