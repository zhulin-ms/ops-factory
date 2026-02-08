import { useEffect, useRef, useState } from 'react'

const GATEWAY_SECRET_KEY = import.meta.env.VITE_GATEWAY_SECRET_KEY || 'test'

interface OnlyOfficePreviewProps {
    name: string
    path: string
    agentId: string
    type: string
    onlyofficeUrl: string
    fileBaseUrl: string
}

declare global {
    interface Window {
        DocsAPI?: {
            DocEditor: new (containerId: string, config: Record<string, unknown>) => OnlyOfficeEditor
        }
    }
}

interface OnlyOfficeEditor {
    destroyEditor: () => void
}

function getDocumentType(fileType: string): string {
    switch (fileType) {
        case 'docx': case 'doc': return 'word'
        case 'xlsx': case 'xls': return 'cell'
        case 'pptx': case 'ppt': return 'slide'
        default: return 'word'
    }
}

const EDITOR_CONTAINER_ID = 'onlyoffice-editor'

export default function OnlyOfficePreview({
    name, path, agentId, type, onlyofficeUrl, fileBaseUrl,
}: OnlyOfficePreviewProps) {
    const editorRef = useRef<OnlyOfficeEditor | null>(null)
    const [scriptError, setScriptError] = useState(false)

    useEffect(() => {
        let cancelled = false

        const initEditor = () => {
            if (cancelled || !window.DocsAPI) return

            // Destroy previous editor if exists
            if (editorRef.current) {
                try { editorRef.current.destroyEditor() } catch { /* ignore */ }
                editorRef.current = null
            }

            const fileUrl = `${fileBaseUrl}/agents/${agentId}/files/${encodeURIComponent(path)}?key=${GATEWAY_SECRET_KEY}`

            editorRef.current = new window.DocsAPI.DocEditor(EDITOR_CONTAINER_ID, {
                document: {
                    fileType: type,
                    title: name,
                    url: fileUrl,
                    permissions: { edit: false, download: true, print: true },
                },
                documentType: getDocumentType(type),
                editorConfig: {
                    mode: 'view',
                    lang: 'zh',
                    customization: {
                        compactHeader: true,
                        toolbarHideFileName: true,
                    },
                },
                type: 'embedded',
                height: '100%',
                width: '100%',
            })
        }

        // Check if API script is already loaded
        if (window.DocsAPI) {
            initEditor()
            return () => {
                cancelled = true
                if (editorRef.current) {
                    try { editorRef.current.destroyEditor() } catch { /* ignore */ }
                    editorRef.current = null
                }
            }
        }

        // Dynamically load the OnlyOffice API script
        const scriptId = 'onlyoffice-api-script'
        let script = document.getElementById(scriptId) as HTMLScriptElement | null

        if (!script) {
            script = document.createElement('script')
            script.id = scriptId
            script.src = `${onlyofficeUrl}/web-apps/apps/api/documents/api.js`
            script.async = true
            script.onload = () => {
                if (!cancelled) initEditor()
            }
            script.onerror = () => {
                if (!cancelled) setScriptError(true)
            }
            document.head.appendChild(script)
        } else {
            // Script tag exists but may still be loading
            if (window.DocsAPI) {
                initEditor()
            } else {
                script.addEventListener('load', () => {
                    if (!cancelled) initEditor()
                })
            }
        }

        return () => {
            cancelled = true
            if (editorRef.current) {
                try { editorRef.current.destroyEditor() } catch { /* ignore */ }
                editorRef.current = null
            }
        }
    }, [name, path, agentId, type, onlyofficeUrl, fileBaseUrl])

    if (scriptError) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--color-text-secondary)',
                padding: 'var(--spacing-6)',
                textAlign: 'center',
            }}>
                <div>
                    <p>Failed to load OnlyOffice Document Server.</p>
                    <p style={{ fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-2)' }}>
                        Ensure the server is running at {onlyofficeUrl}
                    </p>
                </div>
            </div>
        )
    }

    return <div id={EDITOR_CONTAINER_ID} style={{ width: '100%', height: '100%' }} />
}
