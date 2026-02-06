import { useCallback, useEffect, useState, useMemo } from 'react'
import { usePreview } from '../contexts/PreviewContext'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'http://127.0.0.1:3000'
const GATEWAY_SECRET_KEY = import.meta.env.VITE_GATEWAY_SECRET_KEY || 'test'

// Map file extensions to highlight.js language names
const HLJS_LANG_MAP: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    jsx: 'javascript',
    tsx: 'typescript',
    py: 'python',
    sh: 'bash',
    bash: 'bash',
    yaml: 'yaml',
    yml: 'yaml',
    json: 'json',
    html: 'html',
    htm: 'html',
    css: 'css',
    sql: 'sql',
    xml: 'xml',
    svg: 'xml',
    go: 'go',
    rs: 'rust',
    java: 'java',
    rb: 'ruby',
    php: 'php',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    r: 'r',
    lua: 'lua',
    perl: 'perl',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    nginx: 'nginx',
    ini: 'ini',
    toml: 'ini',
    diff: 'diff',
    graphql: 'graphql',
    vue: 'xml',
    svelte: 'xml',
}

// Map file types to display names
function getLanguageName(type: string): string {
    const map: Record<string, string> = {
        js: 'JavaScript',
        ts: 'TypeScript',
        jsx: 'JSX',
        tsx: 'TSX',
        py: 'Python',
        sh: 'Shell',
        bash: 'Bash',
        yaml: 'YAML',
        yml: 'YAML',
        json: 'JSON',
        html: 'HTML',
        htm: 'HTML',
        css: 'CSS',
        md: 'Markdown',
        markdown: 'Markdown',
        txt: 'Text',
        sql: 'SQL',
        xml: 'XML',
        svg: 'SVG',
        go: 'Go',
        rs: 'Rust',
        java: 'Java',
        csv: 'CSV',
    }
    return map[type.toLowerCase()] || type.toUpperCase()
}

// Check if file type should be rendered (not shown as code)
function isRenderedType(type: string): boolean {
    const t = type.toLowerCase()
    return t === 'html' || t === 'htm' || t === 'md' || t === 'markdown'
}

// Check if file is markdown
function isMarkdown(type: string): boolean {
    const t = type.toLowerCase()
    return t === 'md' || t === 'markdown'
}

// Check if file is HTML
function isHtmlType(type: string): boolean {
    const t = type.toLowerCase()
    return t === 'html' || t === 'htm'
}

// Safely decode URL-encoded filename
function decodeFileName(name: string): string {
    try {
        return decodeURIComponent(name)
    } catch {
        return name
    }
}

export default function FilePreview() {
    const { previewFile, isLoading, error, closePreview } = usePreview()
    const [copied, setCopied] = useState(false)
    const [showSource, setShowSource] = useState(false)

    // Reset state when file changes
    useEffect(() => {
        setCopied(false)
        setShowSource(false)
    }, [previewFile?.path])

    const handleCopy = useCallback(async () => {
        if (!previewFile?.content) return
        try {
            await navigator.clipboard.writeText(previewFile.content)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error('Failed to copy:', err)
        }
    }, [previewFile?.content])

    const getDownloadUrl = useCallback(() => {
        if (!previewFile) return ''
        return `${GATEWAY_URL}/agents/${previewFile.agentId}/files/${encodeURIComponent(previewFile.path)}?key=${GATEWAY_SECRET_KEY}`
    }, [previewFile])

    // Syntax highlighted code
    const highlightedCode = useMemo(() => {
        if (!previewFile?.content) return ''
        const lang = HLJS_LANG_MAP[previewFile.type.toLowerCase()]
        if (lang) {
            try {
                return hljs.highlight(previewFile.content, { language: lang }).value
            } catch {
                // Fallback to auto-detection
                try {
                    return hljs.highlightAuto(previewFile.content).value
                } catch {
                    return ''
                }
            }
        }
        // Try auto-detection for unknown types
        try {
            return hljs.highlightAuto(previewFile.content).value
        } catch {
            return ''
        }
    }, [previewFile?.content, previewFile?.type])

    const isOpen = !!previewFile
    const canRender = previewFile && isRenderedType(previewFile.type)
    const isMd = previewFile && isMarkdown(previewFile.type)
    const isHtml = previewFile && isHtmlType(previewFile.type)

    return (
        <div className={`file-preview-panel ${isOpen ? 'open' : ''}`}>
            {isOpen && previewFile && (
                <>
                    <div className="file-preview-header">
                        <div className="file-preview-title">
                            <span className="file-preview-name">{decodeFileName(previewFile.name)}</span>
                            <span className="file-preview-lang">{getLanguageName(previewFile.type)}</span>
                        </div>
                        <div className="file-preview-actions">
                            {canRender && (
                                <button
                                    className={`file-preview-btn ${showSource ? 'active' : ''}`}
                                    onClick={() => setShowSource(!showSource)}
                                    title={showSource ? 'Show rendered' : 'Show source'}
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                        {showSource ? (
                                            <>
                                                <circle cx="12" cy="12" r="10" />
                                                <line x1="2" y1="12" x2="22" y2="12" />
                                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                            </>
                                        ) : (
                                            <>
                                                <polyline points="16 18 22 12 16 6" />
                                                <polyline points="8 6 2 12 8 18" />
                                            </>
                                        )}
                                    </svg>
                                </button>
                            )}
                            <button
                                className="file-preview-btn"
                                onClick={handleCopy}
                                title={copied ? 'Copied!' : 'Copy content'}
                            >
                                {copied ? (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                ) : (
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                )}
                            </button>
                            <a
                                href={getDownloadUrl()}
                                className="file-preview-btn"
                                title="Download"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                            </a>
                            <button
                                className="file-preview-btn file-preview-close"
                                onClick={closePreview}
                                title="Close preview"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div className="file-preview-content">
                        {isLoading && (
                            <div className="file-preview-loading">
                                <div className="loading-spinner" />
                                <p>Loading file...</p>
                            </div>
                        )}

                        {error && (
                            <div className="file-preview-error">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="8" x2="12" y2="12" />
                                    <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                                <p>{error}</p>
                            </div>
                        )}

                        {!isLoading && !error && previewFile.content !== undefined && (
                            <>
                                {/* HTML: render in iframe or show source */}
                                {isHtml && !showSource && (
                                    <iframe
                                        className="file-preview-iframe"
                                        srcDoc={previewFile.content}
                                        sandbox="allow-same-origin"
                                        title={previewFile.name}
                                    />
                                )}

                                {/* Markdown: render or show source */}
                                {isMd && !showSource && (
                                    <div className="file-preview-markdown">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                            {previewFile.content}
                                        </ReactMarkdown>
                                    </div>
                                )}

                                {/* Source view for renderable types */}
                                {canRender && showSource && (
                                    <pre className="file-preview-code">
                                        <code
                                            dangerouslySetInnerHTML={{ __html: highlightedCode || previewFile.content }}
                                        />
                                    </pre>
                                )}

                                {/* Code files: syntax highlighted */}
                                {!canRender && (
                                    <pre className="file-preview-code">
                                        <code
                                            dangerouslySetInnerHTML={{ __html: highlightedCode || previewFile.content }}
                                        />
                                    </pre>
                                )}
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
