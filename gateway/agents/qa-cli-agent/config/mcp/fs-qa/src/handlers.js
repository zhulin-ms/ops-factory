import { execFile as execFileCallback } from 'node:child_process'
import { readFile, realpath, stat } from 'node:fs/promises'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { logError, logInfo } from './logger.js'

const execFile = promisify(execFileCallback)
const CONFIG_FILE_PATH = fileURLToPath(new URL('../../../config.yaml', import.meta.url))
const CONFIG_DIR = path.dirname(CONFIG_FILE_PATH)
const DEFAULT_ROOT_DIR = '../data'
const DEFAULT_FIND_LIMIT = 100
const DEFAULT_SEARCH_LIMIT = 50
const DEFAULT_READ_WINDOW = 200
const MAX_FIND_LIMIT = 500
const MAX_SEARCH_LIMIT = 200
const MAX_READ_WINDOW = 400

let searchEnginePromise

export const tools = [
  {
    name: 'find_files',
    description: 'Find files under the configured root directory.',
    inputSchema: {
      type: 'object',
      properties: {
        pathPrefix: {
          type: 'string',
          description: 'Optional relative subdirectory under rootDir.',
        },
        glob: {
          type: 'string',
          description: 'Optional file name glob such as *.yaml or *.log.',
        },
        limit: {
          type: 'number',
          description: 'Optional maximum number of files to return.',
          minimum: 1,
          maximum: MAX_FIND_LIMIT,
        },
      },
    },
  },
  {
    name: 'search_content',
    description: 'Search text content under the configured root directory.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query text.',
        },
        pathPrefix: {
          type: 'string',
          description: 'Optional relative subdirectory under rootDir.',
        },
        regex: {
          type: 'boolean',
          description: 'Whether query should be treated as a regex.',
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Whether search should be case-sensitive.',
        },
        limit: {
          type: 'number',
          description: 'Optional maximum number of hits to return.',
          minimum: 1,
          maximum: MAX_SEARCH_LIMIT,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_file',
    description: 'Read a file or a specific line range under the configured root directory.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path returned by a previous tool call.',
        },
        startLine: {
          type: 'number',
          minimum: 1,
        },
        endLine: {
          type: 'number',
          minimum: 1,
        },
      },
      required: ['path'],
    },
  },
]

function clamp(value, min, max, fallback) {
  const number = Number.isFinite(value) ? Math.floor(value) : fallback
  return Math.max(min, Math.min(max, number))
}

function stripYamlScalar(value) {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

async function readConfiguredRootDir() {
  if (process.env.QA_CLI_ROOT_DIR?.trim()) {
    return process.env.QA_CLI_ROOT_DIR.trim()
  }

  try {
    const content = await readFile(CONFIG_FILE_PATH, 'utf8')
    const match = content.match(/^\s*rootDir:\s*(.+)\s*$/m)
    if (match?.[1]) {
      return stripYamlScalar(match[1])
    }
  } catch {
    // fall through to default
  }

  return DEFAULT_ROOT_DIR
}

async function getRootDirContext() {
  const configured = await readConfiguredRootDir()
  const resolved = path.isAbsolute(configured) ? configured : path.resolve(CONFIG_DIR, configured)

  try {
    const realRoot = await realpath(resolved)
    return {
      rootDir: realRoot,
      exists: true,
    }
  } catch {
    return {
      rootDir: resolved,
      exists: false,
    }
  }
}

function isWithinRoot(rootDir, candidatePath) {
  const relative = path.relative(rootDir, candidatePath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

async function resolveScopePath(pathPrefix) {
  const root = await getRootDirContext()
  const prefix = typeof pathPrefix === 'string' ? pathPrefix.trim() : ''
  const candidate = prefix ? path.resolve(root.rootDir, prefix) : root.rootDir

  if (!isWithinRoot(root.rootDir, candidate)) {
    throw new Error(`Path escapes configured rootDir: ${candidate}`)
  }

  try {
    const realCandidate = await realpath(candidate)
    if (!isWithinRoot(root.rootDir, realCandidate)) {
      throw new Error(`Resolved path escapes configured rootDir: ${realCandidate}`)
    }
    return {
      rootDir: root.rootDir,
      scopePath: realCandidate,
      exists: true,
    }
  } catch {
    return {
      rootDir: root.rootDir,
      scopePath: candidate,
      exists: false,
    }
  }
}

async function resolveReadableFile(filePath) {
  const root = await getRootDirContext()
  if (!root.exists) {
    throw new Error(`Configured rootDir does not exist: ${root.rootDir}`)
  }

  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('read_file.path is required')
  }

  const candidate = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(root.rootDir, filePath)

  const realFile = await realpath(candidate)
  if (!isWithinRoot(root.rootDir, realFile)) {
    throw new Error(`File escapes configured rootDir: ${realFile}`)
  }

  const stats = await stat(realFile)
  if (!stats.isFile()) {
    throw new Error(`Path is not a file: ${realFile}`)
  }

  return {
    rootDir: root.rootDir,
    filePath: realFile,
  }
}

async function runCommand(command, args) {
  logInfo('command_started', { command, args })

  try {
    const result = await execFile(command, args, {
      maxBuffer: 8 * 1024 * 1024,
      encoding: 'utf8',
    })
    logInfo('command_succeeded', { command, args })
    return result
  } catch (error) {
    const code = error?.code
    if (typeof code === 'number') {
      return {
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? '',
        code,
      }
    }
    throw error
  }
}

async function getSearchEngine() {
  if (!searchEnginePromise) {
    searchEnginePromise = (async () => {
      try {
        await execFile('rg', ['--version'], { maxBuffer: 1024 * 1024 })
        return 'rg'
      } catch {
        return 'grep'
      }
    })()
  }

  return searchEnginePromise
}

function parseRgLine(line) {
  const match = /^(.*?):(\d+):(\d+):(.*)$/.exec(line)
  if (!match) return null
  return {
    path: match[1],
    line: Number.parseInt(match[2], 10),
    column: Number.parseInt(match[3], 10),
    preview: match[4]?.trim() || '',
  }
}

function parseGrepLine(line) {
  const match = /^(.*?):(\d+):(.*)$/.exec(line)
  if (!match) return null
  return {
    path: match[1],
    line: Number.parseInt(match[2], 10),
    column: null,
    preview: match[3]?.trim() || '',
  }
}

function formatReadContent(lines, startLine) {
  return lines
    .map((line, index) => `${String(startLine + index).padStart(4, ' ')}  ${line}`)
    .join('\n')
}

export async function handleFindFiles(args = {}) {
  const scope = await resolveScopePath(args.pathPrefix)
  const limit = clamp(args.limit, 1, MAX_FIND_LIMIT, DEFAULT_FIND_LIMIT)

  if (!scope.exists) {
    return JSON.stringify({ rootDir: scope.rootDir, files: [], total: 0 }, null, 2)
  }

  const commandArgs = [scope.scopePath, '-type', 'f']
  if (typeof args.glob === 'string' && args.glob.trim()) {
    commandArgs.push('-name', args.glob.trim())
  }

  const result = await runCommand('find', commandArgs)
  const lines = result.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, limit)

  const files = []
  for (const filePath of lines) {
    const fileStat = await stat(filePath)
    files.push({
      path: filePath,
      type: fileStat.isFile() ? 'file' : 'other',
      size: fileStat.size,
      mtime: new Date(fileStat.mtimeMs).toISOString(),
    })
  }

  return JSON.stringify({
    rootDir: scope.rootDir,
    files,
    total: files.length,
  }, null, 2)
}

export async function handleSearchContent(args = {}) {
  const query = typeof args.query === 'string' ? args.query.trim() : ''
  if (!query) {
    throw new Error('search_content.query is required')
  }

  const scope = await resolveScopePath(args.pathPrefix)
  const limit = clamp(args.limit, 1, MAX_SEARCH_LIMIT, DEFAULT_SEARCH_LIMIT)

  if (!scope.exists) {
    return JSON.stringify({ rootDir: scope.rootDir, hits: [], total: 0, engine: 'none' }, null, 2)
  }

  const engine = await getSearchEngine()
  let result

  if (engine === 'rg') {
    const commandArgs = ['-n', '--no-heading', '--with-filename', '--column']
    if (!args.caseSensitive) commandArgs.push('-i')
    if (!args.regex) commandArgs.push('-F')
    commandArgs.push(query, scope.scopePath)
    result = await runCommand('rg', commandArgs)
  } else {
    const commandArgs = ['-R', '-n', '-I']
    if (!args.caseSensitive) commandArgs.push('-i')
    if (!args.regex) commandArgs.push('-F')
    commandArgs.push('--', query, scope.scopePath)
    result = await runCommand('grep', commandArgs)
  }

  if (result.code && result.code > 1) {
    throw new Error(result.stderr?.trim() || `search_content failed with code ${result.code}`)
  }

  const parser = engine === 'rg' ? parseRgLine : parseGrepLine
  const hits = result.stdout
    .split('\n')
    .map(line => parser(line.trim()))
    .filter(Boolean)
    .slice(0, limit)

  return JSON.stringify({
    rootDir: scope.rootDir,
    hits,
    total: hits.length,
    engine,
  }, null, 2)
}

export async function handleReadFile(args = {}) {
  const { filePath } = await resolveReadableFile(args.path)
  const buffer = await readFile(filePath)
  if (buffer.includes(0)) {
    throw new Error(`Binary files are not supported: ${filePath}`)
  }

  const content = buffer.toString('utf8')
  const lines = content.split(/\r?\n/)
  const totalLines = lines.length

  const requestedStart = clamp(args.startLine, 1, totalLines || 1, 1)
  const requestedEnd = Number.isFinite(args.endLine)
    ? clamp(args.endLine, requestedStart, totalLines || requestedStart, requestedStart)
    : Math.min(totalLines, requestedStart + DEFAULT_READ_WINDOW - 1)
  const cappedEnd = Math.min(requestedEnd, requestedStart + MAX_READ_WINDOW - 1)
  const selected = lines.slice(requestedStart - 1, cappedEnd)

  return JSON.stringify({
    path: filePath,
    startLine: requestedStart,
    endLine: requestedStart + selected.length - 1,
    totalLines,
    content: formatReadContent(selected, requestedStart),
  }, null, 2)
}

export async function dispatch(name, args = {}) {
  const startedAt = Date.now()
  logInfo('tool_dispatch_started', { tool: name, args })

  try {
    let result

    switch (name) {
      case 'find_files':
        result = await handleFindFiles(args)
        break
      case 'search_content':
        result = await handleSearchContent(args)
        break
      case 'read_file':
        result = await handleReadFile(args)
        break
      default:
        throw new Error(`Unknown tool: ${name}`)
    }

    logInfo('tool_dispatch_succeeded', {
      tool: name,
      durationMs: Date.now() - startedAt,
    })
    return result
  } catch (error) {
    logError('tool_dispatch_failed', {
      tool: name,
      durationMs: Date.now() - startedAt,
      error,
    })
    throw error
  }
}
