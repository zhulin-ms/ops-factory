import { useState, useEffect, useMemo, type ReactNode, type SVGProps } from 'react'
import {
    CodeXml,
    Presentation,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGoosed } from '../../../platform/providers/GoosedContext'
import { usePreview } from '../../../platform/providers/PreviewContext'
import { useUser } from '../../../platform/providers/UserContext'
import { useToast } from '../../../platform/providers/ToastContext'
import PageHeader from '../../../platform/ui/primitives/PageHeader'
import Pagination from '../../../platform/ui/primitives/Pagination'
import ListCard from '../../../platform/ui/list/ListCard'
import ListFooter from '../../../platform/ui/list/ListFooter'
import ListResultsMeta from '../../../platform/ui/list/ListResultsMeta'
import ListSearchInput from '../../../platform/ui/list/ListSearchInput'
import ListToolbar from '../../../platform/ui/list/ListToolbar'
import ListWorkbench from '../../../platform/ui/list/ListWorkbench'
import { GATEWAY_URL, GATEWAY_SECRET_KEY, gatewayHeaders } from '../../../../config/runtime'
import '../styles/files.css'

interface FileInfo {
    name: string
    path: string
    size: number
    modifiedAt: string
    type: string
}

interface AgentFile extends FileInfo {
    agentId: string
    agentName: string
}

type FileCategory = 'all' | 'doc' | 'sheet' | 'slide' | 'markdown' | 'html' | 'others'

const FILE_CATEGORIES: { key: FileCategory; labelKey: string; types: string[] }[] = [
    { key: 'all', labelKey: 'files.categories.all', types: [] },
    { key: 'doc', labelKey: 'files.categories.doc', types: ['docx', 'doc'] },
    { key: 'sheet', labelKey: 'files.categories.sheet', types: ['xlsx', 'xls', 'csv', 'tsv'] },
    { key: 'slide', labelKey: 'files.categories.slide', types: ['pptx', 'ppt'] },
    { key: 'markdown', labelKey: 'files.categories.markdown', types: ['md', 'markdown'] },
    { key: 'html', labelKey: 'files.categories.html', types: ['html', 'htm'] },
]

function getFileCategory(type: string | undefined): FileCategory {
    if (!type) return 'others'
    const lowerType = type.toLowerCase()
    for (const category of FILE_CATEGORIES) {
        if (category.key !== 'all' && category.types.includes(lowerType)) {
            return category.key
        }
    }
    return 'others'
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
}

function formatDate(iso: string): string {
    const date = new Date(iso)
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

type FileIconProps = SVGProps<SVGSVGElement> & {
    strokeWidth?: number
}

type FileIconComponent = (props: FileIconProps) => ReactNode

function FileIconFrame({ children, strokeWidth = 1.85, ...props }: FileIconProps & { children: ReactNode }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            {...props}
        >
            {children}
        </svg>
    )
}

function DocumentFileIcon(props: FileIconProps) {
    return (
        <FileIconFrame {...props}>
            <path d="M7.3 3.75h5.9l4.5 4.45v10.95a1.7 1.7 0 0 1-1.7 1.7H7.3a1.7 1.7 0 0 1-1.7-1.7V5.45a1.7 1.7 0 0 1 1.7-1.7z" />
            <path d="M13.2 3.95v4.35h4.35" />
            <path d="M9.15 11.2h5.7" />
            <path d="M9.15 14.8h5.7" />
        </FileIconFrame>
    )
}

function SheetFileIcon(props: FileIconProps) {
    return (
        <FileIconFrame {...props}>
            <path d="M7.3 3.75h5.9l4.5 4.45v10.95a1.7 1.7 0 0 1-1.7 1.7H7.3a1.7 1.7 0 0 1-1.7-1.7V5.45a1.7 1.7 0 0 1 1.7-1.7z" />
            <path d="M13.2 3.95v4.35h4.35" />
            <path d="M8.9 11.1h6.2" />
            <path d="M8.9 14.1h6.2" />
            <path d="M11.8 9.9v7.15" />
        </FileIconFrame>
    )
}

function MarkdownFileIcon(props: FileIconProps) {
    return (
        <FileIconFrame {...props}>
            <path d="M7.3 3.75h5.9l4.5 4.45v10.95a1.7 1.7 0 0 1-1.7 1.7H7.3a1.7 1.7 0 0 1-1.7-1.7V5.45a1.7 1.7 0 0 1 1.7-1.7z" />
            <path d="M13.2 3.95v4.35h4.35" />
            <path d="M8.75 15.65v-3.55l1.35 1.75 1.35-1.75v3.55" />
            <path d="M13.7 12.35h2.05" />
            <path d="M14.75 11.3v4.95" />
        </FileIconFrame>
    )
}

function ImageFileIcon(props: FileIconProps) {
    return (
        <FileIconFrame {...props}>
            <path d="M7.3 3.75h5.9l4.5 4.45v10.95a1.7 1.7 0 0 1-1.7 1.7H7.3a1.7 1.7 0 0 1-1.7-1.7V5.45a1.7 1.7 0 0 1 1.7-1.7z" />
            <path d="M13.2 3.95v4.35h4.35" />
            <circle cx="10.1" cy="10.35" r="1.15" />
            <path d="M8.65 16.15l2.3-2.55 1.7 1.65 1.55-1.75 1.7 2.65" />
        </FileIconFrame>
    )
}

function CodeFileIcon(props: FileIconProps) {
    return (
        <FileIconFrame {...props}>
            <path d="M7.3 3.75h5.9l4.5 4.45v10.95a1.7 1.7 0 0 1-1.7 1.7H7.3a1.7 1.7 0 0 1-1.7-1.7V5.45a1.7 1.7 0 0 1 1.7-1.7z" />
            <path d="M13.2 3.95v4.35h4.35" />
            <path d="M10.55 11.1L8.95 12.7l1.6 1.6" />
            <path d="M13.45 11.1l1.6 1.6-1.6 1.6" />
        </FileIconFrame>
    )
}

function DefaultFileIcon(props: FileIconProps) {
    return (
        <FileIconFrame {...props}>
            <path d="M7.3 3.75h5.9l4.5 4.45v10.95a1.7 1.7 0 0 1-1.7 1.7H7.3a1.7 1.7 0 0 1-1.7-1.7V5.45a1.7 1.7 0 0 1 1.7-1.7z" />
            <path d="M13.2 3.95v4.35h4.35" />
        </FileIconFrame>
    )
}

function getFileVisual(type: string | undefined): { icon: FileIconComponent; tone: string } {
    switch ((type || '').toLowerCase()) {
        case 'docx':
        case 'doc':
        case 'pdf':
        case 'txt':
        case 'log':
            return { icon: DocumentFileIcon, tone: 'document' }
        case 'xlsx':
        case 'xls':
        case 'csv':
        case 'tsv':
            return { icon: SheetFileIcon, tone: 'sheet' }
        case 'pptx':
        case 'ppt':
            return { icon: Presentation, tone: 'slide' }
        case 'md':
        case 'markdown':
            return { icon: MarkdownFileIcon, tone: 'markdown' }
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'gif':
        case 'svg':
        case 'webp':
            return { icon: ImageFileIcon, tone: 'image' }
        case 'html':
        case 'htm':
            return { icon: CodeXml, tone: 'html' }
        case 'json':
        case 'yaml':
        case 'yml':
        case 'xml':
        case 'js':
        case 'ts':
        case 'tsx':
        case 'jsx':
        case 'py':
        case 'java':
        case 'go':
        case 'sh':
        case 'sql':
            return { icon: CodeFileIcon, tone: 'code' }
        default:
            return { icon: DefaultFileIcon, tone: 'default' }
    }
}

function getDownloadUrl(file: AgentFile, userId?: string | null): string {
    let url = `${GATEWAY_URL}/agents/${file.agentId}/files/${encodeURIComponent(file.path)}?key=${GATEWAY_SECRET_KEY}`
    if (userId) url += `&uid=${encodeURIComponent(userId)}`
    return url
}

export default function FilesPage() {
    const { t } = useTranslation()
    const { agents, isConnected, error: connectionError } = useGoosed()
    const { openPreview, isPreviewable, previewFile, closePreview } = usePreview()
    const { userId } = useUser()
    const { showToast } = useToast()
    const [files, setFiles] = useState<AgentFile[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [activeCategory, setActiveCategory] = useState<FileCategory>('all')
    const [deleteTarget, setDeleteTarget] = useState<AgentFile | null>(null)
    const [deletingKey, setDeletingKey] = useState<string | null>(null)
    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)

    useEffect(() => {
        const loadFiles = async () => {
            if (!isConnected || agents.length === 0) {
                setIsLoading(false)
                return
            }

            setIsLoading(true)
            setError(null)

            try {
                const allFiles: AgentFile[] = []
                const results = await Promise.allSettled(
                    agents.map(async (agent) => {
                        const response = await fetch(`${GATEWAY_URL}/agents/${agent.id}/files`, {
                            headers: gatewayHeaders(userId),
                        })
                        if (!response.ok) return []
                        const data = await response.json() as { files: FileInfo[] }
                        return (data.files || []).map((file) => ({
                            ...file,
                            agentId: agent.id,
                            agentName: agent.name,
                        }))
                    }),
                )

                for (const result of results) {
                    if (result.status === 'fulfilled') {
                        allFiles.push(...result.value)
                    }
                }

                allFiles.sort((left, right) => new Date(right.modifiedAt).getTime() - new Date(left.modifiedAt).getTime())
                setFiles(allFiles)
            } catch (err) {
                console.error('Failed to load files:', err)
                setError(err instanceof Error ? err.message : 'Failed to load files')
            } finally {
                setIsLoading(false)
            }
        }

        void loadFiles()
    }, [agents, isConnected, userId])

    const categoryCounts = useMemo(() => {
        const counts: Record<FileCategory, number> = {
            all: files.length,
            doc: 0,
            sheet: 0,
            slide: 0,
            markdown: 0,
            html: 0,
            others: 0,
        }

        for (const file of files) {
            counts[getFileCategory(file.type)]++
        }
        return counts
    }, [files])

    const filteredFiles = useMemo(() => {
        let result = files

        if (activeCategory !== 'all') {
            result = result.filter((file) => getFileCategory(file.type) === activeCategory)
        }

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase()
            result = result.filter((file) =>
                file.name?.toLowerCase().includes(term) ||
                file.agentName?.toLowerCase().includes(term) ||
                (file.type || '').toLowerCase().includes(term),
            )
        }

        return result
    }, [files, searchTerm, activeCategory])

    const totalPages = Math.max(1, Math.ceil(filteredFiles.length / pageSize))
    const paginatedFiles = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize
        const endIndex = startIndex + pageSize
        return filteredFiles.slice(startIndex, endIndex)
    }, [filteredFiles, currentPage, pageSize])

    useEffect(() => {
        setCurrentPage(1)
    }, [searchTerm, activeCategory])

    const handleDelete = async (file: AgentFile) => {
        const fileKey = `${file.agentId}-${file.path}`
        setDeletingKey(fileKey)
        try {
            const response = await fetch(`${GATEWAY_URL}/agents/${file.agentId}/files/${encodeURIComponent(file.path)}`, {
                method: 'DELETE',
                headers: gatewayHeaders(userId),
            })
            if (!response.ok) {
                const data = await response.json().catch(() => null)
                throw new Error(data?.error || `Failed to delete file: ${response.status}`)
            }

            setFiles((prev) => prev.filter((current) => !(current.agentId === file.agentId && current.path === file.path)))
            if (previewFile?.agentId === file.agentId && previewFile.path === file.path) {
                closePreview()
            }
            setDeleteTarget(null)
            showToast('success', `已删除 ${file.name}`)
        } catch (err) {
            console.error('Failed to delete file:', err)
            showToast('error', err instanceof Error ? err.message : '删除文件失败')
        } finally {
            setDeletingKey(null)
        }
    }

    return (
        <div className="page-container sidebar-top-page page-shell-wide files-page">
            <PageHeader title={t('files.title')} subtitle={t('files.subtitle')} />

            {(error || (!isConnected && connectionError)) && (
                <div className="conn-banner conn-banner-error">
                    {error || t('common.connectionError', { error: connectionError })}
                </div>
            )}
            <ListWorkbench
                controls={(
                    <ListToolbar
                        primary={(
                            <>
                                <ListSearchInput
                                    value={searchTerm}
                                    placeholder={t('files.searchPlaceholder')}
                                    onChange={setSearchTerm}
                                />

                                <div className="seg-filter">
                                    {FILE_CATEGORIES.map((category) => (
                                        <button
                                            key={category.key}
                                            className={`seg-filter-btn ${activeCategory === category.key ? 'active' : ''}`}
                                            onClick={() => setActiveCategory(category.key)}
                                        >
                                            {t(category.labelKey)}
                                            {categoryCounts[category.key] > 0 && (
                                                <span className="seg-filter-count">{categoryCounts[category.key]}</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                        secondary={(searchTerm || activeCategory !== 'all') ? <ListResultsMeta>{t('common.resultsFound', { count: filteredFiles.length })}</ListResultsMeta> : undefined}
                    />
                )}
                footer={filteredFiles.length > 0 ? (
                    <ListFooter>
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            pageSize={pageSize}
                            totalItems={filteredFiles.length}
                            onPageChange={setCurrentPage}
                            onPageSizeChange={(newSize) => {
                                setPageSize(newSize)
                                setCurrentPage(1)
                            }}
                            disabled={isLoading}
                        />
                    </ListFooter>
                ) : undefined}
            >
                {isLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-10)' }}>
                        <div className="loading-spinner" />
                    </div>
                ) : files.length === 0 ? (
                    <div className="empty-state">
                        <DefaultFileIcon className="empty-state-icon" strokeWidth={1.6} />
                        <h3 className="empty-state-title">{t('files.noFiles')}</h3>
                        <p className="empty-state-description">{t('files.noFilesHint')}</p>
                    </div>
                ) : searchTerm && filteredFiles.length === 0 ? (
                    <div className="empty-state">
                        <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <h3 className="empty-state-title">{t('common.noResults')}</h3>
                        <p className="empty-state-description">{t('files.noMatchFiles', { term: searchTerm })}</p>
                    </div>
                ) : (
                    <div className="file-list">
                        {paginatedFiles.map((file) => {
                            const fileKey = `${file.agentId}-${file.path}`
                            const isDeleting = deletingKey === fileKey
                            const { icon: FileIcon, tone } = getFileVisual(file.type)

                            return (
                                <ListCard key={fileKey} className={`file-item animate-slide-in${isDeleting ? ' is-deleting' : ''}`}>
                                    <div className={`file-icon file-icon-${tone}`} aria-hidden="true">
                                        <FileIcon strokeWidth={1.9} />
                                    </div>
                                    <div className="file-info">
                                        <div className="file-name">{file.name}</div>
                                        <div className="file-meta">
                                            <div className="file-meta-tags">
                                                <span className="file-agent-tag">{file.agentName}</span>
                                            </div>
                                            <div className="file-meta-details">
                                                <span>{formatFileSize(file.size)}</span>
                                                <span>{formatDate(file.modifiedAt)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="file-actions">
                                        {isPreviewable(file.type, file.name, file.path) && (
                                            <button
                                                className="icon-action-button"
                                                title={t('files.preview')}
                                                onClick={() => openPreview({
                                                    name: file.name,
                                                    path: file.path,
                                                    type: file.type,
                                                    agentId: file.agentId,
                                                })}
                                            >
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                    <circle cx="12" cy="12" r="3" />
                                                </svg>
                                            </button>
                                        )}
                                        <a
                                            href={getDownloadUrl(file, userId) + '&download=true'}
                                            className="file-download-btn"
                                            title={t('files.download')}
                                            download
                                        >
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                <polyline points="7 10 12 15 17 10" />
                                                <line x1="12" y1="15" x2="12" y2="3" />
                                            </svg>
                                        </a>
                                        <button className="file-delete-btn" title="删除文件" onClick={() => setDeleteTarget(file)}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                                                <polyline points="3 6 5 6 21 6" />
                                                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                                <line x1="10" y1="11" x2="10" y2="17" />
                                                <line x1="14" y1="11" x2="14" y2="17" />
                                            </svg>
                                        </button>
                                    </div>
                                </ListCard>
                            )
                        })}
                    </div>
                )}
            </ListWorkbench>

            {deleteTarget && (
                <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setDeleteTarget(null)}>
                    <div className="modal" onClick={(event) => event.stopPropagation()}>
                        <div className="modal-header">
                            <h2 className="modal-title">删除文件</h2>
                            <button className="modal-close" onClick={() => setDeleteTarget(null)} aria-label={t('common.close')}>
                                &times;
                            </button>
                        </div>

                        <div className="modal-body">
                            <p style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-text-primary)', marginBottom: 'var(--spacing-4)' }}>
                                将永久删除 “{deleteTarget.name}”，此操作不可恢复。
                            </p>
                        </div>

                        <div className="modal-footer">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setDeleteTarget(null)}
                                disabled={deletingKey === `${deleteTarget.agentId}-${deleteTarget.path}`}
                            >
                                取消
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={() => handleDelete(deleteTarget)}
                                disabled={deletingKey === `${deleteTarget.agentId}-${deleteTarget.path}`}
                            >
                                {deletingKey === `${deleteTarget.agentId}-${deleteTarget.path}` ? '删除中...' : '确认删除'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
