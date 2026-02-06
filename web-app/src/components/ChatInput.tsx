import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent, DragEvent } from 'react'
import AgentSelector from './AgentSelector'

// File handling constants
const MAX_FILES_PER_MESSAGE = 10
const MAX_FILE_SIZE_MB = 10
const MAX_IMAGE_SIZE_MB = 5
const SUPPORTED_FILE_TYPES = [
    // Text files
    '.txt', '.md', '.json', '.yaml', '.yml', '.xml', '.csv', '.tsv',
    // Code files
    '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
    '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala', '.sh', '.bash',
    '.css', '.scss', '.less', '.html', '.vue', '.svelte',
    // Config files
    '.env', '.gitignore', '.dockerignore', '.editorconfig', '.prettierrc',
    '.eslintrc', '.babelrc', 'Dockerfile', 'Makefile',
    // Images
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
]

interface UploadedFile {
    id: string
    file: File
    name: string
    type: string
    size: number
    isImage: boolean
    preview?: string  // Data URL for image preview
    content?: string  // Text content for text files
    isLoading: boolean
    error?: string
}

interface ChatInputProps {
    onSubmit: (message: string) => void
    disabled?: boolean
    placeholder?: string
    autoFocus?: boolean
    selectedAgent?: string
    onAgentChange?: (agentId: string) => void
    showAgentSelector?: boolean
    modelInfo?: { provider: string; model: string } | null
}

export default function ChatInput({
    onSubmit,
    disabled = false,
    placeholder = "Type a message...",
    autoFocus = false,
    selectedAgent = '',
    onAgentChange,
    showAgentSelector = true,
    modelInfo
}: ChatInputProps) {
    const [value, setValue] = useState('')
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
    const [isDragging, setIsDragging] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current
        if (textarea) {
            textarea.style.height = 'auto'
            textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
        }
    }, [value])

    // Auto focus
    useEffect(() => {
        if (autoFocus && textareaRef.current) {
            textareaRef.current.focus()
        }
    }, [autoFocus])

    const isFileTypeSupported = (file: File): boolean => {
        const extension = '.' + file.name.split('.').pop()?.toLowerCase()
        return SUPPORTED_FILE_TYPES.includes(extension) || file.name === 'Dockerfile' || file.name === 'Makefile'
    }

    const processFile = async (file: File): Promise<UploadedFile> => {
        const isImage = file.type.startsWith('image/')
        const maxSize = isImage ? MAX_IMAGE_SIZE_MB : MAX_FILE_SIZE_MB

        const uploadedFile: UploadedFile = {
            id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            file,
            name: file.name,
            type: file.type,
            size: file.size,
            isImage,
            isLoading: true,
        }

        // Check file type
        if (!isFileTypeSupported(file)) {
            return {
                ...uploadedFile,
                isLoading: false,
                error: `Unsupported file type. Supported: ${SUPPORTED_FILE_TYPES.slice(0, 10).join(', ')}...`
            }
        }

        // Check file size
        if (file.size > maxSize * 1024 * 1024) {
            return {
                ...uploadedFile,
                isLoading: false,
                error: `File too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max: ${maxSize}MB`
            }
        }

        try {
            if (isImage) {
                // Read image as data URL for preview
                const dataUrl = await readFileAsDataURL(file)
                return {
                    ...uploadedFile,
                    preview: dataUrl,
                    isLoading: false,
                }
            } else {
                // Read text file content
                const content = await readFileAsText(file)
                return {
                    ...uploadedFile,
                    content,
                    isLoading: false,
                }
            }
        } catch (err) {
            return {
                ...uploadedFile,
                isLoading: false,
                error: `Failed to read file: ${err instanceof Error ? err.message : 'Unknown error'}`
            }
        }
    }

    const readFileAsDataURL = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = () => reject(new Error('Failed to read file'))
            reader.readAsDataURL(file)
        })
    }

    const readFileAsText = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = () => reject(new Error('Failed to read file'))
            reader.readAsText(file)
        })
    }

    const handleFileSelect = async (files: FileList | null) => {
        if (!files || files.length === 0) return

        // Check max files limit
        const remainingSlots = MAX_FILES_PER_MESSAGE - uploadedFiles.length
        if (remainingSlots <= 0) {
            alert(`Maximum ${MAX_FILES_PER_MESSAGE} files allowed per message.`)
            return
        }

        const filesToProcess = Array.from(files).slice(0, remainingSlots)

        // Add files with loading state
        const newFiles = filesToProcess.map(file => ({
            id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            file,
            name: file.name,
            type: file.type,
            size: file.size,
            isImage: file.type.startsWith('image/'),
            isLoading: true,
        }))

        setUploadedFiles(prev => [...prev, ...newFiles])

        // Process files in parallel
        for (const newFile of newFiles) {
            const processed = await processFile(newFile.file)
            setUploadedFiles(prev =>
                prev.map(f => f.id === newFile.id ? processed : f)
            )
        }

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
    }

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)

        const files = e.dataTransfer.files
        handleFileSelect(files)
    }

    const handleRemoveFile = (id: string) => {
        setUploadedFiles(prev => prev.filter(f => f.id !== id))
    }

    const buildMessageWithFiles = (): string => {
        let messageText = value.trim()

        const validFiles = uploadedFiles.filter(f => !f.error && !f.isLoading)

        if (validFiles.length === 0) {
            return messageText
        }

        // Build file context
        const fileContextParts: string[] = []

        for (const file of validFiles) {
            if (file.isImage && file.preview) {
                // For images, include as inline reference (the model can see the preview)
                fileContextParts.push(`[Image: ${file.name}]`)
            } else if (file.content) {
                // For text files, include the content
                fileContextParts.push(`--- File: ${file.name} ---\n${file.content}\n--- End of ${file.name} ---`)
            }
        }

        if (fileContextParts.length > 0) {
            const fileContext = fileContextParts.join('\n\n')
            messageText = messageText
                ? `${fileContext}\n\n${messageText}`
                : fileContext
        }

        return messageText
    }

    const handleSubmit = () => {
        const messageText = buildMessageWithFiles()

        if (messageText && !disabled) {
            onSubmit(messageText)
            setValue('')
            setUploadedFiles([])
            // Reset textarea height
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto'
            }
        }
    }

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            handleSubmit()
        }
    }

    const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        setValue(e.target.value)
    }

    const handleFileInputClick = () => {
        fileInputRef.current?.click()
    }

    const hasContent = value.trim() || uploadedFiles.some(f => !f.error && !f.isLoading)
    const isAnyFileLoading = uploadedFiles.some(f => f.isLoading)

    return (
        <div
            className={`chat-input-container ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={SUPPORTED_FILE_TYPES.join(',')}
                onChange={(e) => handleFileSelect(e.target.files)}
                style={{ display: 'none' }}
            />

            {/* Drag overlay */}
            {isDragging && (
                <div className="drag-overlay">
                    <div className="drag-overlay-content">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="48" height="48">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <p>Drop files here</p>
                    </div>
                </div>
            )}

            {/* Uploaded files preview */}
            {uploadedFiles.length > 0 && (
                <div className="uploaded-files">
                    {uploadedFiles.map(file => (
                        <div key={file.id} className={`uploaded-file ${file.error ? 'error' : ''}`}>
                            {file.isImage && file.preview ? (
                                <img src={file.preview} alt={file.name} className="uploaded-file-preview" />
                            ) : (
                                <div className="uploaded-file-icon">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                                        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                                        <polyline points="13 2 13 9 20 9" />
                                    </svg>
                                </div>
                            )}
                            <div className="uploaded-file-info">
                                <span className="uploaded-file-name">{file.name}</span>
                                {file.error ? (
                                    <span className="uploaded-file-error">{file.error}</span>
                                ) : file.isLoading ? (
                                    <span className="uploaded-file-loading">Loading...</span>
                                ) : (
                                    <span className="uploaded-file-size">
                                        {(file.size / 1024).toFixed(1)} KB
                                    </span>
                                )}
                            </div>
                            <button
                                className="uploaded-file-remove"
                                onClick={() => handleRemoveFile(file.id)}
                                aria-label="Remove file"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="chat-input-wrapper">
                <textarea
                    ref={textareaRef}
                    className="chat-input"
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    rows={1}
                />
                <button
                    className="chat-send-btn-new"
                    onClick={handleSubmit}
                    disabled={disabled || !hasContent || isAnyFileLoading}
                    aria-label="Send message"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                </button>
            </div>

            {/* Toolbar */}
            <div className="chat-input-toolbar">
                {/* Attach button */}
                <button
                    className="toolbar-btn"
                    onClick={handleFileInputClick}
                    disabled={disabled || uploadedFiles.length >= MAX_FILES_PER_MESSAGE}
                    title={`Attach files (${uploadedFiles.length}/${MAX_FILES_PER_MESSAGE})`}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                    {uploadedFiles.length > 0 && (
                        <span className="toolbar-badge">{uploadedFiles.length}</span>
                    )}
                </button>

                <div className="toolbar-divider" />

                {/* Model info */}
                {modelInfo && (
                    <>
                        <div className="toolbar-item toolbar-model-info">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                                <circle cx="12" cy="12" r="3" />
                                <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
                            </svg>
                            <span className="toolbar-text">{modelInfo.model}</span>
                        </div>
                        <div className="toolbar-divider" />
                    </>
                )}

                {/* Agent selector */}
                {showAgentSelector && onAgentChange && (
                    <AgentSelector
                        selectedAgent={selectedAgent}
                        onAgentChange={onAgentChange}
                        disabled={disabled}
                    />
                )}
            </div>
        </div>
    )
}
