import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'
const KNOWLEDGE_SERVICE_URL = process.env.KNOWLEDGE_SERVICE_URL || 'http://127.0.0.1:8092'
const KNOWLEDGE_REQUEST_TIMEOUT_MS = parseInt(process.env.KNOWLEDGE_REQUEST_TIMEOUT_MS || '15000', 10)
const KNOWLEDGE_FETCH_MAX_NEIGHBOR_WINDOW = 2
const CONFIG_FILE_PATH = fileURLToPath(new URL('../../../config.yaml', import.meta.url))

const API_PREFIX = '/knowledge'
import { LOG_FILE_PATH, logError, logInfo } from './logger.js'

export { LOG_FILE_PATH }

export const tools = [
  {
    name: 'search',
    description: 'Search knowledge chunks. Uses the config.yaml knowledge scope when sourceIds is omitted.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query text.',
        },
        sourceIds: {
          type: 'array',
          description: 'Optional source IDs. Defaults to the config.yaml knowledge scope.',
          items: { type: 'string' },
        },
        documentIds: {
          type: 'array',
          description: 'Optional document IDs to narrow the search.',
          items: { type: 'string' },
        },
        topK: {
          type: 'number',
          description: 'Optional result size. Defaults to 8.',
          minimum: 1,
          maximum: 20,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch',
    description: 'Fetch a knowledge chunk by chunkId, with optional neighbor chunks.',
    inputSchema: {
      type: 'object',
      properties: {
        chunkId: {
          type: 'string',
          description: 'Chunk ID returned from search.',
        },
        includeNeighbors: {
          type: 'boolean',
          description: 'Whether to include adjacent chunks.',
        },
        neighborWindow: {
          type: 'number',
          description: 'Neighbor window size when includeNeighbors is true. Defaults to 1.',
          minimum: 1,
          maximum: KNOWLEDGE_FETCH_MAX_NEIGHBOR_WINDOW,
        },
      },
      required: ['chunkId'],
    },
  },
]

async function readSettings() {
  try {
    const content = await readFile(CONFIG_FILE_PATH, 'utf-8')
    const parsed = YAML.parse(content)
    const sourceId = parsed?.extensions?.['knowledge-service']?.['x-opsfactory']?.knowledgeScope?.sourceId
    return {
      sourceId: typeof sourceId === 'string' && sourceId.trim() ? sourceId.trim() : null,
    }
  } catch {
    return {
      sourceId: null,
    }
  }
}

async function normalizeSourceIds(sourceIds) {
  if (Array.isArray(sourceIds) && sourceIds.length > 0) {
    return sourceIds.filter(Boolean)
  }
  const settings = await readSettings()
  return settings.sourceId ? [settings.sourceId] : []
}

function createTimeoutSignal() {
  return AbortSignal.timeout(Number.isFinite(KNOWLEDGE_REQUEST_TIMEOUT_MS) ? KNOWLEDGE_REQUEST_TIMEOUT_MS : 15000)
}

async function ks(path, init) {
  const startedAt = Date.now()
  const method = init?.method || 'GET'

  logInfo('knowledge_request_started', {
    method,
    path,
  })

  const response = await fetch(`${KNOWLEDGE_SERVICE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    signal: createTimeoutSignal(),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    const error = new Error(`Knowledge service ${path} returned ${response.status}: ${text}`)
    logError('knowledge_request_failed', {
      method,
      path,
      status: response.status,
      durationMs: Date.now() - startedAt,
      responseText: text,
      error,
    })
    throw error
  }

  const data = await response.json()
  logInfo('knowledge_request_succeeded', {
    method,
    path,
    status: response.status,
    durationMs: Date.now() - startedAt,
  })
  return data
}

export async function handleSearch(args) {
  const query = args.query?.trim()
  if (!query) {
    throw new Error('search.query is required')
  }

  const sourceIds = await normalizeSourceIds(args.sourceIds)

  if (sourceIds.length === 0) {
    logInfo('knowledge_scope_empty_search_skipped', {
      query,
    })
    return JSON.stringify({
      query,
      hits: [],
      total: 0,
    }, null, 2)
  }

  const body = {
    query,
    sourceIds,
    documentIds: args.documentIds || [],
    topK: args.topK ?? 8,
  }

  const result = await ks(`${API_PREFIX}/search`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

  return JSON.stringify(result, null, 2)
}

export async function handleFetch(args) {
  const chunkId = args.chunkId?.trim()
  if (!chunkId) {
    throw new Error('fetch.chunkId is required')
  }

  const neighborWindow = args.neighborWindow ?? 1
  if (!Number.isInteger(neighborWindow) || neighborWindow < 1 || neighborWindow > KNOWLEDGE_FETCH_MAX_NEIGHBOR_WINDOW) {
    throw new Error(`fetch.neighborWindow must be an integer between 1 and ${KNOWLEDGE_FETCH_MAX_NEIGHBOR_WINDOW}`)
  }

  const params = new URLSearchParams()
  params.set('includeNeighbors', String(Boolean(args.includeNeighbors)))
  params.set('neighborWindow', String(neighborWindow))
  params.set('includeMarkdown', 'true')
  params.set('includeRawText', 'true')

  const result = await ks(`${API_PREFIX}/fetch/${encodeURIComponent(chunkId)}?${params.toString()}`)
  return JSON.stringify(result, null, 2)
}

export async function dispatch(name, args = {}) {
  const startedAt = Date.now()
  logInfo('tool_dispatch_started', {
    tool: name,
    args,
  })

  try {
    let result

    switch (name) {
      case 'search':
        result = await handleSearch(args)
        break
      case 'fetch':
        result = await handleFetch(args)
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
