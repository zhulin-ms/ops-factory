import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

const KNOWLEDGE_URL = process.env.KNOWLEDGE_SERVICE_URL || 'http://127.0.0.1:8092'
const SOURCE_ID = process.env.KNOWLEDGE_THRESHOLD_SOURCE_ID || 'src_285c13458d3a'
const QUERY = process.env.KNOWLEDGE_THRESHOLD_QUERY || '数据库 运维'

type RetrievalMode = 'hybrid' | 'semantic' | 'lexical'

interface RetrievalProfileConfig {
  sourceId: string
  id: string
  name: string
  scope: string
  readonly: boolean
  config: Record<string, unknown>
}

interface SearchHit {
  score: number
  semanticScore: number
  lexicalScore: number
  fusionScore: number
}

interface SearchResponse {
  total: number
  hits: SearchHit[]
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function getRetrievalConfigSection(config: Record<string, unknown>): Record<string, unknown> {
  const retrieval = config.retrieval
  return retrieval && typeof retrieval === 'object' && !Array.isArray(retrieval)
    ? { ...(retrieval as Record<string, unknown>) }
    : {}
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${KNOWLEDGE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(15_000),
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) as T : null

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${path}: ${text}`)
  }

  return data as T
}

async function getSource(): Promise<{ id: string; retrievalProfileId: string }> {
  return requestJson(`/knowledge/sources/${SOURCE_ID}`)
}

async function getRetrievalProfileConfig(): Promise<RetrievalProfileConfig> {
  return requestJson(`/knowledge/sources/${SOURCE_ID}/config/retrieval-profile`)
}

async function putRetrievalProfileConfig(config: RetrievalProfileConfig): Promise<void> {
  await requestJson(`/knowledge/sources/${SOURCE_ID}/config/retrieval-profile`, {
    method: 'PUT',
    body: JSON.stringify({
      name: config.name,
      config: config.config,
    }),
  })
}

async function resetRetrievalProfileConfig(): Promise<void> {
  await requestJson(`/knowledge/sources/${SOURCE_ID}/config/retrieval-profile:reset`, {
    method: 'POST',
  })
}

async function search(mode: RetrievalMode, scoreThreshold?: number): Promise<SearchResponse> {
  const override: Record<string, unknown> = {
    mode,
    includeScores: true,
  }

  if (typeof scoreThreshold === 'number') {
    override.scoreThreshold = scoreThreshold
  }

  return requestJson('/knowledge/search', {
    method: 'POST',
    body: JSON.stringify({
      query: QUERY,
      sourceIds: [SOURCE_ID],
      topK: 5,
      override,
    }),
  })
}

async function restoreRetrievalProfile(original: RetrievalProfileConfig): Promise<void> {
  if (original.scope === 'system' && original.readonly) {
    await resetRetrievalProfileConfig()
    return
  }

  await putRetrievalProfileConfig(original)
}

async function applyThresholds(
  original: RetrievalProfileConfig,
  values: { semanticThreshold?: number | null; lexicalThreshold?: number | null }
): Promise<void> {
  const next = deepClone(original)
  const retrieval = getRetrievalConfigSection(next.config)

  delete retrieval.scoreThreshold
  delete retrieval.semanticThreshold
  delete retrieval.lexicalThreshold

  if (values.semanticThreshold !== undefined && values.semanticThreshold !== null) {
    retrieval.semanticThreshold = values.semanticThreshold
  }
  if (values.lexicalThreshold !== undefined && values.lexicalThreshold !== null) {
    retrieval.lexicalThreshold = values.lexicalThreshold
  }

  next.config = {
    ...next.config,
    retrieval,
  }

  await putRetrievalProfileConfig(next)
}

describe.sequential('knowledge retrieval thresholds against live source', () => {
  let originalProfile: RetrievalProfileConfig

  beforeAll(async () => {
    const source = await getSource()
    expect(source.id).toBe(SOURCE_ID)
    expect(source.retrievalProfileId).toBeTruthy()
    originalProfile = await getRetrievalProfileConfig()
  })

  afterEach(async () => {
    await restoreRetrievalProfile(originalProfile)
  })

  afterAll(async () => {
    await restoreRetrievalProfile(originalProfile)
  })

  it('semanticThreshold changes semantic search result count', async () => {
    const baseline = await search('semantic', 0.0)
    expect(baseline.total).toBeGreaterThan(0)

    const topScore = baseline.hits[0]?.score ?? 0
    const strictThreshold = topScore >= 0.999 ? 1.0 : Math.min(1.0, topScore + 0.01)

    await applyThresholds(originalProfile, { semanticThreshold: strictThreshold })

    const filtered = await search('semantic')
    expect(filtered.total).toBeLessThan(baseline.total)

    await applyThresholds(originalProfile, { semanticThreshold: 0.0 })
    const restored = await search('semantic')
    expect(restored.total).toBe(baseline.total)
  })

  it('lexicalThreshold changes lexical search result count', async () => {
    const baseline = await search('lexical', 0.0)
    expect(baseline.total).toBeGreaterThan(0)

    const topScore = baseline.hits[0]?.score ?? 0
    const strictThreshold = topScore >= 0.999 ? 1.0 : Math.min(1.0, topScore + 0.01)

    await applyThresholds(originalProfile, { lexicalThreshold: strictThreshold })

    const filtered = await search('lexical')
    expect(filtered.total).toBeLessThan(baseline.total)

    await applyThresholds(originalProfile, { lexicalThreshold: 0.0 })
    const restored = await search('lexical')
    expect(restored.total).toBe(baseline.total)
  })

  it('hybrid search ignores semantic and lexical threshold settings', async () => {
    const baseline = await search('hybrid')
    expect(baseline.total).toBeGreaterThan(0)

    await applyThresholds(originalProfile, {
      semanticThreshold: 0.95,
      lexicalThreshold: 0.95,
    })

    const withProfileThresholds = await search('hybrid')
    expect(withProfileThresholds.total).toBe(baseline.total)

    const withOverrideThreshold = await search('hybrid', 0.95)
    expect(withOverrideThreshold.total).toBe(baseline.total)
  })
})
