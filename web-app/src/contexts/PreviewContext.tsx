import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { getPreviewKind, inferFileType, needsTextContent, PreviewKind } from '../utils/filePreview'
import { parseCsvTable } from '../utils/officePreview'

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'http://127.0.0.1:3000'
const GATEWAY_SECRET_KEY = import.meta.env.VITE_GATEWAY_SECRET_KEY || 'test'

interface OfficePreviewConfig {
    enabled: boolean
    onlyofficeUrl: string
    fileBaseUrl: string
}

export interface PreviewFile {
    name: string
    path: string
    type: string
    agentId: string
    previewKind: PreviewKind
    content?: string
    tableData?: string[][]
    onlyofficeUrl?: string
    fileBaseUrl?: string
}

interface PreviewRequest {
    name: string
    path: string
    type: string
    agentId: string
}

interface PreviewContextType {
    previewFile: PreviewFile | null
    isLoading: boolean
    error: string | null
    openPreview: (file: PreviewRequest) => Promise<void>
    closePreview: () => void
    isPreviewable: (type: string, name?: string, path?: string) => boolean
}

const PreviewContext = createContext<PreviewContextType | null>(null)

export function PreviewProvider({ children }: { children: ReactNode }) {
    const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [officePreview, setOfficePreview] = useState<OfficePreviewConfig>({
        enabled: false,
        onlyofficeUrl: '',
        fileBaseUrl: '',
    })

    // Fetch gateway config on mount
    useEffect(() => {
        fetch(`${GATEWAY_URL}/config`, {
            headers: { 'x-secret-key': GATEWAY_SECRET_KEY },
        })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (data?.officePreview) {
                    setOfficePreview(data.officePreview)
                }
            })
            .catch(() => { /* gateway not reachable — office preview stays disabled */ })
    }, [])

    const isPreviewable = useCallback((type: string, name?: string, path?: string) => {
        const kind = getPreviewKind({ type, name, path })
        if (kind === 'office') return officePreview.enabled
        return kind !== 'unsupported'
    }, [officePreview.enabled])

    const openPreview = useCallback(async (file: PreviewRequest) => {
        setIsLoading(true)
        setError(null)

        try {
            const normalizedType = inferFileType(file)
            const previewKind = getPreviewKind(file)
            if (previewKind === 'unsupported') {
                throw new Error(`Unsupported preview type: ${normalizedType}`)
            }

            const normalizedFile = { ...file, type: normalizedType, previewKind }

            if (!needsTextContent(previewKind)) {
                if (previewKind === 'office') {
                    setPreviewFile({
                        ...normalizedFile,
                        onlyofficeUrl: officePreview.onlyofficeUrl,
                        fileBaseUrl: officePreview.fileBaseUrl,
                    })
                    return
                }

                if (previewKind === 'spreadsheet') {
                    const url = `${GATEWAY_URL}/agents/${file.agentId}/files/${encodeURIComponent(file.path)}?key=${GATEWAY_SECRET_KEY}`
                    const res = await fetch(url)
                    if (!res.ok) throw new Error(`Failed to fetch spreadsheet: ${res.status}`)

                    const tableData = parseCsvTable(await res.text(), normalizedType === 'tsv' ? '\t' : ',')
                    const content = tableData.map(row => row.join('\t')).join('\n')
                    setPreviewFile({ ...normalizedFile, content, tableData })
                    return
                }

                setPreviewFile(normalizedFile)
                return
            }

            const url = `${GATEWAY_URL}/agents/${file.agentId}/files/${encodeURIComponent(file.path)}?key=${GATEWAY_SECRET_KEY}`
            const res = await fetch(url)

            if (!res.ok) {
                throw new Error(`Failed to fetch file: ${res.status}`)
            }

            const content = await res.text()
            setPreviewFile({ ...normalizedFile, content })
        } catch (err) {
            console.error('Failed to load file for preview:', err)
            setError(err instanceof Error ? err.message : 'Failed to load file')
            setPreviewFile(null)
        } finally {
            setIsLoading(false)
        }
    }, [officePreview])

    const closePreview = useCallback(() => {
        setPreviewFile(null)
        setError(null)
    }, [])

    return (
        <PreviewContext.Provider value={{
            previewFile,
            isLoading,
            error,
            openPreview,
            closePreview,
            isPreviewable,
        }}>
            {children}
        </PreviewContext.Provider>
    )
}

export function usePreview() {
    const context = useContext(PreviewContext)
    if (!context) {
        throw new Error('usePreview must be used within a PreviewProvider')
    }
    return context
}
