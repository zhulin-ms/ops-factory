/**
 * Business Service API integration tests — CRUD + keyword search + migrate.
 *
 * Tests use a real Java gateway process against actual file-based storage.
 * Each test creates its own business services and cleans up after itself.
 *
 * API endpoints under test (prefix /ops-gateway/business-services):
 *   GET    /                    — list business services (?groupId, ?hostId, ?keyword)
 *   GET    /{id}                — get business service by id
 *   GET    /{id}/resolved       — get with resolved hosts
 *   GET    /{id}/hosts          — get associated hosts
 *   GET    /{id}/topology       — get topology
 *   POST   /                    — create business service
 *   PUT    /{id}                — update business service
 *   DELETE /{id}                — delete business service
 *   POST   /migrate             — migrate from Host.business field
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startJavaGateway, type GatewayHandle } from '../helpers.js'

const USER_ADMIN = 'admin'
const USER_NON_ADMIN = 'test-alice'

let gw: GatewayHandle

beforeAll(async () => {
  gw = await startJavaGateway()
}, 60_000)

afterAll(async () => {
  if (gw) await gw.stop()
}, 15_000)

// ─── Helpers ──────────────────────────────────────────────

interface BusinessServicePayload {
  name: string
  code?: string
  groupId?: string | null
  description?: string
  clusterIds?: string[] // legacy field, maps to hostIds
  tags?: string[]
  priority?: string
  contactInfo?: string
}

/** Create a test business service and return the response. */
async function createBs(payload: BusinessServicePayload) {
  return gw.fetchAs(USER_ADMIN, '/business-services', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** Delete a test business service (best-effort cleanup). */
async function deleteBs(id: string) {
  return gw.fetchAs(USER_ADMIN, `/business-services/${id}`, { method: 'DELETE' })
}

/** Parse JSON from a response. */
async function parseBody(res: Response) {
  return res.json() as Promise<Record<string, any>>
}

/** Generate unique suffix for test isolation. */
function uid(suffix: string) {
  return `${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ─── READ — Listing ──────────────────────────────────────

describe('BusinessService Read — GET /business-services', () => {
  it('returns a businessServices array', async () => {
    const res = await gw.fetchAs(USER_ADMIN, '/business-services')
    expect(res.ok).toBe(true)
    const data = await parseBody(res)
    expect(Array.isArray(data.businessServices)).toBe(true)
  })

  it('lists created business services', async () => {
    const name1 = `ListBS-A-${uid('lb')}`
    const name2 = `ListBS-B-${uid('lb')}`
    const res1 = await createBs({ name: name1, code: 'LA' })
    const res2 = await createBs({ name: name2, code: 'LB' })
    expect(res1.status).toBe(201)
    expect(res2.status).toBe(201)

    const id1 = (await parseBody(res1)).businessService.id
    const id2 = (await parseBody(res2)).businessService.id

    try {
      const listRes = await gw.fetchAs(USER_ADMIN, '/business-services')
      expect(listRes.ok).toBe(true)
      const data = await parseBody(listRes)
      const ids = data.businessServices.map((bs: any) => bs.id)
      expect(ids).toContain(id1)
      expect(ids).toContain(id2)
    } finally {
      await deleteBs(id1)
      await deleteBs(id2)
    }
  })
})

// ─── READ — Get by ID ────────────────────────────────────

describe('BusinessService Read — GET /business-services/{id}', () => {
  it('returns business service details for existing id', async () => {
    const payload: BusinessServicePayload = {
      name: `GetById-${uid('gb')}`,
      code: 'GB',
      description: 'Test business service for get-by-id',
      tags: ['TEST'],
    }
    const createRes = await createBs(payload)
    expect(createRes.status).toBe(201)
    const created = await parseBody(createRes)
    const bsId = created.businessService.id

    try {
      const getRes = await gw.fetchAs(USER_ADMIN, `/business-services/${bsId}`)
      expect(getRes.ok).toBe(true)
      const data = await parseBody(getRes)
      expect(data.success).toBe(true)
      expect(data.businessService).toBeDefined()
      expect(data.businessService.id).toBe(bsId)
      expect(data.businessService.name).toBe(payload.name)
      expect(data.businessService.code).toBe(payload.code)
    } finally {
      await deleteBs(bsId)
    }
  })

  it('returns 404 for non-existent business service', async () => {
    const res = await gw.fetchAs(USER_ADMIN, '/business-services/nonexistent-bs-id-xyz')
    expect(res.status).toBe(404)
    const data = await parseBody(res)
    expect(data.success).toBe(false)
  })
})

// ─── READ — Resolved ─────────────────────────────────────

describe('BusinessService Read — GET /business-services/{id}/resolved', () => {
  it('returns resolved business service with host info', async () => {
    const payload: BusinessServicePayload = {
      name: `Resolved-${uid('rs')}`,
      code: 'RS',
    }
    const createRes = await createBs(payload)
    const bsId = (await parseBody(createRes)).businessService.id

    try {
      const res = await gw.fetchAs(USER_ADMIN, `/business-services/${bsId}/resolved`)
      expect(res.ok).toBe(true)
      const data = await parseBody(res)
      expect(data.success).toBe(true)
      expect(data.businessService.id).toBe(bsId)
      expect(data.businessService.resolvedHosts).toBeDefined()
    } finally {
      await deleteBs(bsId)
    }
  })
})

// ─── READ — Hosts ────────────────────────────────────────

describe('BusinessService Read — GET /business-services/{id}/hosts', () => {
  it('returns hosts array', async () => {
    const payload: BusinessServicePayload = {
      name: `HostsBS-${uid('hb')}`,
      code: 'HB',
    }
    const createRes = await createBs(payload)
    const bsId = (await parseBody(createRes)).businessService.id

    try {
      const res = await gw.fetchAs(USER_ADMIN, `/business-services/${bsId}/hosts`)
      expect(res.ok).toBe(true)
      const data = await parseBody(res)
      expect(Array.isArray(data.hosts)).toBe(true)
    } finally {
      await deleteBs(bsId)
    }
  })
})

// ─── READ — Topology ─────────────────────────────────────

describe('BusinessService Read — GET /business-services/{id}/topology', () => {
  it('returns topology structure', async () => {
    const payload: BusinessServicePayload = {
      name: `TopoBS-${uid('tb')}`,
      code: 'TB',
    }
    const createRes = await createBs(payload)
    const bsId = (await parseBody(createRes)).businessService.id

    try {
      const res = await gw.fetchAs(USER_ADMIN, `/business-services/${bsId}/topology`)
      expect(res.ok).toBe(true)
      const data = await parseBody(res)
      expect(Array.isArray(data.nodes)).toBe(true)
      expect(Array.isArray(data.edges)).toBe(true)
    } finally {
      await deleteBs(bsId)
    }
  })
})

// ─── CREATE ──────────────────────────────────────────────

describe('BusinessService Create — POST /business-services', () => {
  const createdIds: string[] = []

  afterAll(async () => {
    for (const id of createdIds) {
      await deleteBs(id)
    }
  })

  it('creates a business service with all fields', async () => {
    const payload: BusinessServicePayload = {
      name: `FullCreate-${uid('fc')}`,
      code: 'FC',
      description: 'Full create test business service',
      tags: ['CORE', 'PRODUCTION'],
      priority: 'high',
      contactInfo: 'team@example.com',
    }
    const res = await createBs(payload)
    expect(res.status).toBe(201)
    const data = await parseBody(res)
    expect(data.success).toBe(true)
    expect(data.businessService).toBeDefined()
    expect(data.businessService.id).toBeDefined()
    expect(data.businessService.name).toBe(payload.name)
    expect(data.businessService.code).toBe(payload.code)
    expect(data.businessService.description).toBe(payload.description)
    expect(data.businessService.tags).toEqual(payload.tags)
    expect(data.businessService.priority).toBe(payload.priority)
    expect(data.businessService.contactInfo).toBe(payload.contactInfo)
    expect(data.businessService.createdAt).toBeDefined()
    expect(data.businessService.updatedAt).toBeDefined()
    createdIds.push(data.businessService.id)
  })

  it('creates a business service with defaults', async () => {
    const payload: BusinessServicePayload = {
      name: `MinimalCreate-${uid('mc')}`,
    }
    const res = await createBs(payload)
    expect(res.status).toBe(201)
    const data = await parseBody(res)
    expect(data.success).toBe(true)
    expect(data.businessService.code).toBe('')
    expect(data.businessService.hostIds).toEqual([])
    expect(data.businessService.tags).toEqual([])
    expect(data.businessService.priority).toBe('')
    createdIds.push(data.businessService.id)
  })
})

// ─── UPDATE ──────────────────────────────────────────────

describe('BusinessService Update — PUT /business-services/{id}', () => {
  let bsId: string

  beforeAll(async () => {
    const payload: BusinessServicePayload = {
      name: `UpdateTarget-${uid('ut')}`,
      code: 'UT',
      tags: ['INIT'],
      description: 'Original description',
    }
    const res = await createBs(payload)
    bsId = (await parseBody(res)).businessService.id
  })

  afterAll(async () => {
    await deleteBs(bsId)
  })

  it('updates individual fields', async () => {
    const res = await gw.fetchAs(USER_ADMIN, `/business-services/${bsId}`, {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated-Name', code: 'UPD' }),
    })
    expect(res.ok).toBe(true)
    const data = await parseBody(res)
    expect(data.success).toBe(true)
    expect(data.businessService.name).toBe('Updated-Name')
    expect(data.businessService.code).toBe('UPD')
  })

  it('updates tags', async () => {
    const newTags = ['PROD', 'UPDATED']
    const res = await gw.fetchAs(USER_ADMIN, `/business-services/${bsId}`, {
      method: 'PUT',
      body: JSON.stringify({ tags: newTags }),
    })
    expect(res.ok).toBe(true)
    const data = await parseBody(res)
    expect(data.businessService.tags).toEqual(newTags)
  })

  it('returns 404 for non-existent business service', async () => {
    const res = await gw.fetchAs(USER_ADMIN, '/business-services/nonexistent-xyz-id', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Ghost' }),
    })
    expect(res.status).toBe(404)
    const data = await parseBody(res)
    expect(data.success).toBe(false)
  })
})

// ─── DELETE ──────────────────────────────────────────────

describe('BusinessService Delete — DELETE /business-services/{id}', () => {
  it('deletes an existing business service', async () => {
    const payload: BusinessServicePayload = {
      name: `DeleteTarget-${uid('dt')}`,
    }
    const createRes = await createBs(payload)
    const bsId = (await parseBody(createRes)).businessService.id

    const deleteRes = await gw.fetchAs(USER_ADMIN, `/business-services/${bsId}`, { method: 'DELETE' })
    expect(deleteRes.ok).toBe(true)
    const deleteData = await parseBody(deleteRes)
    expect(deleteData.success).toBe(true)

    // Verify gone
    const getRes = await gw.fetchAs(USER_ADMIN, `/business-services/${bsId}`)
    expect(getRes.status).toBe(404)
  })

  it('returns 404 for non-existent business service', async () => {
    const res = await gw.fetchAs(USER_ADMIN, '/business-services/nonexistent-delete-xyz', { method: 'DELETE' })
    expect(res.status).toBe(404)
    const data = await parseBody(res)
    expect(data.success).toBe(false)
  })
})

// ─── Keyword Search ──────────────────────────────────────

describe('BusinessService Search — GET /business-services?keyword=', () => {
  const createdIds: string[] = []

  afterAll(async () => {
    for (const id of createdIds) {
      await deleteBs(id)
    }
  })

  it('searches by keyword matching name', async () => {
    const uniqueName = `SearchTarget-${uid('st')}`
    const res = await createBs({ name: uniqueName, code: 'ST', tags: ['SEARCH'] })
    createdIds.push((await parseBody(res)).businessService.id)

    const searchRes = await gw.fetchAs(USER_ADMIN, `/business-services?keyword=${uniqueName}`)
    expect(searchRes.ok).toBe(true)
    const data = await parseBody(searchRes)
    expect(data.businessServices.length).toBeGreaterThanOrEqual(1)
    expect(data.businessServices.some((bs: any) => bs.name === uniqueName)).toBe(true)
  })

  it('searches by keyword matching code', async () => {
    const uniqueCode = `CODE-${uid('c')}`
    const res = await createBs({ name: `CodeSearch-${uid('cs')}`, code: uniqueCode })
    createdIds.push((await parseBody(res)).businessService.id)

    const searchRes = await gw.fetchAs(USER_ADMIN, `/business-services?keyword=${uniqueCode}`)
    expect(searchRes.ok).toBe(true)
    const data = await parseBody(searchRes)
    expect(data.businessServices.some((bs: any) => bs.code === uniqueCode)).toBe(true)
  })

  it('returns all for empty keyword', async () => {
    const res = await gw.fetchAs(USER_ADMIN, '/business-services?keyword=')
    expect(res.ok).toBe(true)
    const data = await parseBody(res)
    expect(Array.isArray(data.businessServices)).toBe(true)
  })
})

// ─── Filter by groupId ──────────────────────────────────

describe('BusinessService Filter — GET /business-services?groupId=', () => {
  const createdIds: string[] = []

  afterAll(async () => {
    for (const id of createdIds) {
      await deleteBs(id)
    }
  })

  it('filters by groupId', async () => {
    // Create a group first
    const groupRes = await gw.fetchAs(USER_ADMIN, '/host-groups', {
      method: 'POST',
      body: JSON.stringify({ name: `FilterGroup-${uid('fg')}` }),
    })
    const groupId = (await parseBody(groupRes)).group.id

    const res = await createBs({
      name: `FilterBS-${uid('fb')}`,
      code: 'FB',
      groupId,
    })
    createdIds.push((await parseBody(res)).businessService.id)

    const filterRes = await gw.fetchAs(USER_ADMIN, `/business-services?groupId=${groupId}`)
    expect(filterRes.ok).toBe(true)
    const data = await parseBody(filterRes)
    expect(data.businessServices.length).toBeGreaterThanOrEqual(1)
    expect(data.businessServices.every((bs: any) => bs.groupId === groupId)).toBe(true)

    // Cleanup group
    await gw.fetchAs(USER_ADMIN, `/host-groups/${groupId}`, { method: 'DELETE' })
  })
})

// ─── Migrate ─────────────────────────────────────────────

describe('BusinessService Migrate — POST /business-services/migrate', () => {
  it('returns migration result', async () => {
    const res = await gw.fetchAs(USER_ADMIN, '/business-services/migrate', { method: 'POST' })
    expect(res.ok).toBe(true)
    const data = await parseBody(res)
    expect(data).toHaveProperty('migrated')
    expect(Array.isArray(data.businessServices)).toBe(true)
  })
})

// ─── Auth ────────────────────────────────────────────────

describe('BusinessService Auth', () => {
  it('requires valid secret key', async () => {
    const res = await fetch(`${gw.baseUrl}/business-services`, {
      headers: { 'x-secret-key': 'wrong-key', 'x-user-id': USER_ADMIN },
    })
    expect(res.status).toBe(401)
  })

  it('forbids non-admin from creating', async () => {
    const res = await gw.fetchAs(USER_NON_ADMIN, '/business-services', {
      method: 'POST',
      body: JSON.stringify({ name: 'Blocked' }),
    })
    expect(res.status).toBe(403)
  })

  it('forbids non-admin from deleting', async () => {
    const res = await gw.fetchAs(USER_NON_ADMIN, '/business-services/nonexistent', {
      method: 'DELETE',
    })
    expect(res.status).toBe(403)
  })
})

// ─── Full Lifecycle ───────────────────────────────────────

describe('BusinessService Full Lifecycle — create > read > update > delete', () => {
  it('completes the full CRUD cycle', async () => {
    const payload: BusinessServicePayload = {
      name: `Lifecycle-${uid('lc')}`,
      code: 'LC',
      description: 'Lifecycle test',
      tags: ['LIFECYCLE'],
    }
    const createRes = await createBs(payload)
    expect(createRes.status).toBe(201)
    const created = await parseBody(createRes)
    const bsId = created.businessService.id
    expect(created.success).toBe(true)
    expect(created.businessService.name).toBe(payload.name)

    // READ — by id
    const getRes = await gw.fetchAs(USER_ADMIN, `/business-services/${bsId}`)
    expect(getRes.ok).toBe(true)
    const fetched = await parseBody(getRes)
    expect(fetched.businessService.id).toBe(bsId)

    // READ — in listing
    const listRes = await gw.fetchAs(USER_ADMIN, '/business-services')
    const listData = await parseBody(listRes)
    expect(listData.businessServices.some((bs: any) => bs.id === bsId)).toBe(true)

    // UPDATE
    const updateRes = await gw.fetchAs(USER_ADMIN, `/business-services/${bsId}`, {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated-Lifecycle', tags: ['LIFECYCLE', 'UPDATED'] }),
    })
    expect(updateRes.ok).toBe(true)
    const updated = await parseBody(updateRes)
    expect(updated.businessService.name).toBe('Updated-Lifecycle')
    expect(updated.businessService.tags).toContain('UPDATED')

    // DELETE
    const deleteRes = await gw.fetchAs(USER_ADMIN, `/business-services/${bsId}`, { method: 'DELETE' })
    expect(deleteRes.ok).toBe(true)

    // VERIFY gone
    const goneRes = await gw.fetchAs(USER_ADMIN, `/business-services/${bsId}`)
    expect(goneRes.status).toBe(404)
  })
})
