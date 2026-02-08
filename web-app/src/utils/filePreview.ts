export type PreviewKind = 'code' | 'markdown' | 'html' | 'image' | 'pdf' | 'audio' | 'video' | 'office' | 'spreadsheet' | 'unsupported'

interface FileIdentity {
    type?: string
    name?: string
    path?: string
}

const MARKDOWN_TYPES = new Set(['md', 'markdown'])
const HTML_TYPES = new Set(['html', 'htm'])
const IMAGE_TYPES = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])
const PDF_TYPES = new Set(['pdf'])
const AUDIO_TYPES = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'])
const VIDEO_TYPES = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv'])
const OFFICE_TYPES = new Set(['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt'])
const SPREADSHEET_TYPES = new Set(['csv', 'tsv'])

const CODE_AND_TEXT_TYPES = new Set([
    'txt', 'log', 'ini', 'conf',
    'js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs',
    'py', 'sh', 'bash', 'zsh',
    'yaml', 'yml', 'json', 'toml',
    'css', 'scss', 'less',
    'xml', 'sql', 'graphql',
    'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp',
    'rb', 'php', 'swift', 'kt', 'scala',
    'csv', 'tsv',
    'env', 'gitignore', 'dockerignore', 'editorconfig', 'prettierrc', 'eslintrc', 'babelrc',
    'dockerfile', 'makefile',
    'vue', 'svelte',
])

export function inferFileType(file: FileIdentity): string {
    const rawType = (file.type || '').trim().toLowerCase()
    if (rawType && rawType !== 'unknown') return rawType

    const rawName = (file.name || file.path || '').trim()
    const baseName = rawName.split('/').pop()?.split('\\').pop() || rawName
    const lowerBaseName = baseName.toLowerCase()

    if (lowerBaseName === 'dockerfile') return 'dockerfile'
    if (lowerBaseName === 'makefile') return 'makefile'
    if (lowerBaseName.startsWith('.')) return lowerBaseName.slice(1)

    const ext = lowerBaseName.includes('.') ? lowerBaseName.split('.').pop() : ''
    return ext || 'unknown'
}

export function getPreviewKind(file: FileIdentity): PreviewKind {
    const type = inferFileType(file)

    if (MARKDOWN_TYPES.has(type)) return 'markdown'
    if (HTML_TYPES.has(type)) return 'html'
    if (IMAGE_TYPES.has(type)) return 'image'
    if (PDF_TYPES.has(type)) return 'pdf'
    if (AUDIO_TYPES.has(type)) return 'audio'
    if (VIDEO_TYPES.has(type)) return 'video'
    if (OFFICE_TYPES.has(type)) return 'office'
    if (SPREADSHEET_TYPES.has(type)) return 'spreadsheet'
    if (CODE_AND_TEXT_TYPES.has(type)) return 'code'
    return 'unsupported'
}

export function isPreviewableFile(file: FileIdentity): boolean {
    return getPreviewKind(file) !== 'unsupported'
}

export function needsTextContent(kind: PreviewKind): boolean {
    return kind === 'code' || kind === 'markdown' || kind === 'html'
}
