import { sanitizeFileCitationSnippet } from './fileCitation'

export interface FileCitation {
    index: number
    path: string
    lineFrom: number | null
    lineTo: number | null
    snippet: string | null
}

const FILE_CITE_REGEX = /\[\[filecite:([\s\S]*?)\]\]/g

function sanitizeField(value: string | undefined): string | null {
    const trimmed = (value || '').trim()
    return trimmed.length > 0 ? trimmed : null
}

interface ParsedFileCitationToken {
    citation: FileCitation
    identityKey: string
}

function splitFileCitationFields(body: string): string[] | null {
    const fields: string[] = []
    let start = 0

    for (let index = 0; index < 4; index += 1) {
        const separator = body.indexOf('|', start)
        if (separator < 0) return null
        fields.push(body.slice(start, separator))
        start = separator + 1
    }

    fields.push(body.slice(start))
    return fields
}

function parseLineNumber(value: string | undefined): number | null {
    const trimmed = (value || '').trim()
    if (!trimmed) return null
    const parsed = Number.parseInt(trimmed, 10)
    return Number.isFinite(parsed) ? parsed : null
}

function parseFileCitationBody(body: string, fallbackIndex: number): ParsedFileCitationToken | null {
    const rawParts = splitFileCitationFields(body)
    if (!rawParts || rawParts.length < 5) return null
    const parts = rawParts.map(part => part.trim())

    const index = Number.parseInt(parts[0], 10)
    if (!Number.isFinite(index)) return null

    const filePath = sanitizeField(parts[1])
    if (!filePath) return null

    return {
        identityKey: `index:${index}`,
        citation: {
            index: Number.isFinite(index) ? index : fallbackIndex,
            path: filePath,
            lineFrom: parseLineNumber(parts[2]),
            lineTo: parseLineNumber(parts[3]),
            snippet: sanitizeFileCitationSnippet(sanitizeField(parts[4])),
        },
    }
}

function getDisplayCitation(
    token: ParsedFileCitationToken,
    displayCitations: Map<string, FileCitation>,
): FileCitation {
    const existing = displayCitations.get(token.identityKey)
    if (existing) {
        return existing
    }

    const displayCitation = {
        ...token.citation,
        index: displayCitations.size + 1,
    }
    displayCitations.set(token.identityKey, displayCitation)
    return displayCitation
}

export function parseFileCitations(text: string): FileCitation[] {
    const displayCitations = new Map<string, FileCitation>()
    const re = new RegExp(FILE_CITE_REGEX.source, FILE_CITE_REGEX.flags)
    let match: RegExpExecArray | null
    let fallbackIndex = 1

    while ((match = re.exec(text)) !== null) {
        const token = parseFileCitationBody(match[1], fallbackIndex)
        if (token) {
            getDisplayCitation(token, displayCitations)
            fallbackIndex = Math.max(fallbackIndex, token.citation.index + 1)
        }
    }

    return Array.from(displayCitations.values())
}

export function hasFileCitations(text: string): boolean {
    return new RegExp(FILE_CITE_REGEX.source).test(text)
}

export function replaceFileCitationsWithPlaceholders(text: string): string {
    let fallbackIndex = 1
    const displayCitations = new Map<string, FileCitation>()
    return text.replace(new RegExp(FILE_CITE_REGEX.source, FILE_CITE_REGEX.flags), (_, body: string) => {
        const token = parseFileCitationBody(body, fallbackIndex)
        if (token) {
            const citation = getDisplayCitation(token, displayCitations)
            fallbackIndex = Math.max(fallbackIndex, token.citation.index + 1)
            return `[FILECITE_${citation.index}](#filecite-${citation.index})`
        }
        return ''
    })
}

export function stripFileCitations(text: string): string {
    return text.replace(new RegExp(FILE_CITE_REGEX.source, FILE_CITE_REGEX.flags), '')
}
