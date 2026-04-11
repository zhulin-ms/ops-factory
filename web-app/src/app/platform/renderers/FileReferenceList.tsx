import { useCallback, useState } from 'react'
import { GATEWAY_SECRET_KEY, GATEWAY_URL } from '../../../config/runtime'
import { usePreview } from '../providers/PreviewContext'
import { useUser } from '../providers/UserContext'
import type { FileCitation } from '../../../utils/fileCitationParser'
import { getFileCitationDisplayPath } from '../../../utils/fileCitation'
import { getPreviewKind } from '../../../utils/filePreview'
import './ReferenceList.css'

interface FileReferenceListProps {
    citations: FileCitation[]
    label?: string
    agentId?: string
}

interface FileReferenceGroup {
    key: string
    path: string
    title: string
    citationCount: number
    citationIndices: number[]
    lineLabels: string[]
}

function getFileName(filePath: string): string {
    const segments = filePath.split(/[\\/]/).filter(Boolean)
    return segments[segments.length - 1] || filePath
}

function getLineLabel(citation: FileCitation): string | null {
    if (citation.lineFrom == null && citation.lineTo == null) return null
    if (citation.lineFrom != null && citation.lineTo != null) {
        return citation.lineFrom === citation.lineTo
            ? `L${citation.lineFrom}`
            : `L${citation.lineFrom}-${citation.lineTo}`
    }
    return `L${citation.lineFrom ?? citation.lineTo}`
}

function groupReferences(citations: FileCitation[]): FileReferenceGroup[] {
    const groups: FileReferenceGroup[] = []
    const groupsByPath = new Map<string, FileReferenceGroup>()

    for (const citation of citations) {
        const key = citation.path
        const existing = groupsByPath.get(key)
        const lineLabel = getLineLabel(citation)

        if (existing) {
            existing.citationCount += 1
            if (!existing.citationIndices.includes(citation.index)) {
                existing.citationIndices.push(citation.index)
            }
            if (lineLabel && !existing.lineLabels.includes(lineLabel)) {
                existing.lineLabels.push(lineLabel)
            }
            continue
        }

        const group: FileReferenceGroup = {
            key,
            path: citation.path,
            title: getFileName(citation.path),
            citationCount: 1,
            citationIndices: [citation.index],
            lineLabels: lineLabel ? [lineLabel] : [],
        }
        groupsByPath.set(key, group)
        groups.push(group)
    }

    return groups
}

export default function FileReferenceList({
    citations,
    label = '回答中引用的文件',
    agentId,
}: FileReferenceListProps) {
    if (citations.length === 0) return null
    const { openPreview } = usePreview()
    const { userId } = useUser()
    const [openingKey, setOpeningKey] = useState<string | null>(null)

    const groups = groupReferences(citations)
    if (groups.length === 0) return null

    const handlePreview = useCallback(async (group: FileReferenceGroup) => {
        if (!agentId) return

        const fetchHeaders: Record<string, string> = { 'x-secret-key': GATEWAY_SECRET_KEY }
        if (userId) fetchHeaders['x-user-id'] = userId

        const baseUrl = `${GATEWAY_URL}/agents/${agentId}/file-citations/content?path=${encodeURIComponent(group.path)}`
        const downloadUrl = `${baseUrl}&key=${GATEWAY_SECRET_KEY}${userId ? `&uid=${encodeURIComponent(userId)}` : ''}`
        const type = group.title.split('.').pop() || 'txt'
        const previewKind = getPreviewKind({ name: group.title, path: group.path, type })

        setOpeningKey(group.key)
        try {
            await openPreview({
                name: group.title,
                path: group.path,
                type,
                content: '',
                downloadUrl,
                previewKind,
            })

            const response = await fetch(baseUrl, { headers: fetchHeaders })
            if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`)

            await openPreview({
                name: group.title,
                path: group.path,
                type,
                content: await response.text(),
                downloadUrl,
                previewKind,
            })
        } finally {
            setOpeningKey(null)
        }
    }, [agentId, openPreview, userId])

    return (
        <div className="reference-list">
            <div className="reference-list-label">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                </svg>
                {label} ({groups.length})
            </div>
            <div className="reference-capsules">
                {groups.map((group) => (
                    <button
                        key={group.key}
                        type="button"
                        className={`reference-capsule${agentId ? ' linked' : ''}`}
                        onClick={() => void handlePreview(group)}
                        disabled={!agentId || openingKey === group.key}
                    >
                        <span className="reference-capsule-indices" aria-label={`引用序号 ${group.citationIndices.join(', ')}`}>
                            {group.citationIndices.map(index => (
                                <span key={index} className="reference-capsule-index">{index}</span>
                            ))}
                        </span>
                        <span className="reference-capsule-title">{group.title}</span>
                        <span className="reference-capsule-meta">
                            {group.citationCount} 处引用
                            {group.lineLabels.length > 0 ? ` · ${group.lineLabels.join(', ')}` : ''}
                        </span>
                        <span className="reference-capsule-meta">{getFileCitationDisplayPath(group.path)}</span>
                    </button>
                ))}
            </div>
        </div>
    )
}
