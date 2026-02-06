import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'http://127.0.0.1:3000'
const GATEWAY_SECRET_KEY = import.meta.env.VITE_GATEWAY_SECRET_KEY || 'test'

// File types that can be previewed as text
const PREVIEWABLE_TYPES = new Set([
    'txt', 'md', 'markdown',
    'js', 'ts', 'jsx', 'tsx',
    'py', 'sh', 'bash', 'zsh',
    'yaml', 'yml', 'json', 'toml',
    'css', 'scss', 'less',
    'html', 'htm', 'xml', 'svg',
    'sql', 'graphql',
    'go', 'rs', 'java', 'c', 'cpp', 'h',
    'env', 'gitignore', 'dockerfile',
    'csv',
])

export interface PreviewFile {
    name: string
    path: string
    type: string
    agentId: string
    content?: string
}

interface PreviewContextType {
    previewFile: PreviewFile | null
    isLoading: boolean
    error: string | null
    openPreview: (file: PreviewFile) => Promise<void>
    closePreview: () => void
    isPreviewable: (type: string) => boolean
}

const PreviewContext = createContext<PreviewContextType | null>(null)

export function PreviewProvider({ children }: { children: ReactNode }) {
    const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const isPreviewable = useCallback((type: string) => {
        return PREVIEWABLE_TYPES.has(type.toLowerCase())
    }, [])

    const openPreview = useCallback(async (file: PreviewFile) => {
        setIsLoading(true)
        setError(null)

        try {
            const url = `${GATEWAY_URL}/agents/${file.agentId}/files/${encodeURIComponent(file.path)}?key=${GATEWAY_SECRET_KEY}`
            const res = await fetch(url)

            if (!res.ok) {
                throw new Error(`Failed to fetch file: ${res.status}`)
            }

            const content = await res.text()
            setPreviewFile({ ...file, content })
        } catch (err) {
            console.error('Failed to load file for preview:', err)
            setError(err instanceof Error ? err.message : 'Failed to load file')
            setPreviewFile({ ...file, content: '' })
        } finally {
            setIsLoading(false)
        }
    }, [])

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
