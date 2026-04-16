/**
 * HostGroup API integration tests — CRUD with optional `code` field.
 *
 * API endpoints under test (prefix /gateway/host-groups):
 *   GET    /          — list groups
 *   GET    /{id}      — get group by id
 *   POST   /          — create group
 *   PUT    /{id}      — update group
 *   DELETE /{id}      — delete group
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { startJavaGateway, type GatewayHandle } from '../helpers.js'

const USER_ADMIN = 'admin'

let gw: GatewayHandle
const createdGroupIds: string[] = []

beforeAll(async () => {
  gw = await startJavaGateway()
}, 60_000)

afterAll(async () => {
  // Cleanup all groups created during tests
  for (const id of createdGroupIds) {
    try {
      await gw.fetchAs(USER_ADMIN, `/host-groups/${id}`, { method: 'DELETE' })
    } catch { /* best-effort */ }
  }
  if (gw) await gw.stop()
}, 15_000)

// ─── Helpers ──────────────────────────────────────────────

interface GroupPayload {
  name: string
  code?: string
  parentId?: string | null
  description?: string
}

async function parseBody(res: Response) {
  return res.json() as Promise<Record<string, any>>
}

function uid(suffix: string) {
  return `${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function createGroup(payload: GroupPayload) {
  const res = await gw.fetchAs(USER_ADMIN, '/host-groups', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  const data = await parseBody(res)
  if (data.success && data.group?.id) {
    createdGroupIds.push(data.group.id)
  }
  return { res, data }
}

// ─── CREATE ──────────────────────────────────────────────

describe('HostGroup Create — POST /host-groups', () => {
  it('creates a group without code (backward compatible)', async () => {
    const { res, data } = await createGroup({ name: `NoCode-${uid('g')}` })
    expect(res.ok).toBe(true)
    expect(data.success).toBe(true)
    expect(data.group).toBeDefined()
    expect(data.group.name).toBeTruthy()
  })

  it('creates a group with code', async () => {
    const { res, data } = await createGroup({
      name: `WithCode-${uid('g')}`,
      code: 'PROD',
    })
    expect(res.ok).toBe(true)
    expect(data.success).toBe(true)
    expect(data.group).toBeDefined()
    expect(data.group.code).toBe('PROD')
  })

  it('creates a group with empty code', async () => {
    const { res, data } = await createGroup({
      name: `EmptyCode-${uid('g')}`,
      code: '',
    })
    expect(res.ok).toBe(true)
    expect(data.success).toBe(true)
    expect(data.group).toBeDefined()
    // empty string is acceptable — treated as "no code"
    expect(data.group.code).toBe('')
  })
})

// ─── READ ──────────────────────────────────────────────

describe('HostGroup Read — GET /host-groups', () => {
  it('lists groups and includes code field', async () => {
    // Create a group with code first
    const { data: createData } = await createGroup({
      name: `ListCode-${uid('g')}`,
      code: 'DEV',
    })
    const codeGroupId = createData.group.id

    const res = await gw.fetchAs(USER_ADMIN, '/host-groups')
    expect(res.ok).toBe(true)
    const data = await parseBody(res)
    expect(Array.isArray(data.groups)).toBe(true)

    const found = data.groups.find((g: any) => g.id === codeGroupId)
    expect(found).toBeDefined()
    expect(found.code).toBe('DEV')
  })

  it('gets a single group with code by id', async () => {
    const { data: createData } = await createGroup({
      name: `GetCode-${uid('g')}`,
      code: 'STG',
    })
    const groupId = createData.group.id

    const res = await gw.fetchAs(USER_ADMIN, `/host-groups/${groupId}`)
    expect(res.ok).toBe(true)
    const data = await parseBody(res)
    expect(data.success).toBe(true)
    expect(data.group.id).toBe(groupId)
    expect(data.group.code).toBe('STG')
  })
})

// ─── UPDATE ──────────────────────────────────────────────

describe('HostGroup Update — PUT /host-groups/{id}', () => {
  it('adds code to an existing group that had no code', async () => {
    // Create without code
    const { data: createData } = await createGroup({ name: `AddCode-${uid('g')}` })
    const groupId = createData.group.id
    expect(createData.group.code).toBeFalsy()

    // Update with code
    const res = await gw.fetchAs(USER_ADMIN, `/host-groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify({ code: 'UAT' }),
    })
    expect(res.ok).toBe(true)
    const data = await parseBody(res)
    expect(data.success).toBe(true)
    expect(data.group.code).toBe('UAT')
  })

  it('updates existing code to a new value', async () => {
    const { data: createData } = await createGroup({
      name: `UpdCode-${uid('g')}`,
      code: 'OLD',
    })
    const groupId = createData.group.id

    const res = await gw.fetchAs(USER_ADMIN, `/host-groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify({ code: 'NEW' }),
    })
    expect(res.ok).toBe(true)
    const data = await parseBody(res)
    expect(data.success).toBe(true)
    expect(data.group.code).toBe('NEW')
  })

  it('clears code by setting to empty string', async () => {
    const { data: createData } = await createGroup({
      name: `ClearCode-${uid('g')}`,
      code: 'TEMP',
    })
    const groupId = createData.group.id

    const res = await gw.fetchAs(USER_ADMIN, `/host-groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify({ code: '' }),
    })
    expect(res.ok).toBe(true)
    const data = await parseBody(res)
    expect(data.success).toBe(true)
    expect(data.group.code).toBe('')
  })

  it('preserves code when updating other fields', async () => {
    const { data: createData } = await createGroup({
      name: `KeepCode-${uid('g')}`,
      code: 'KEPT',
    })
    const groupId = createData.group.id

    // Update only description, not code
    const res = await gw.fetchAs(USER_ADMIN, `/host-groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify({ description: 'updated desc' }),
    })
    expect(res.ok).toBe(true)
    const data = await parseBody(res)
    expect(data.success).toBe(true)
    // code should remain unchanged
    expect(data.group.code).toBe('KEPT')
    expect(data.group.description).toBe('updated desc')
  })
})

// ─── PERSISTENCE ──────────────────────────────────────────

describe('HostGroup Persistence — code survives re-read', () => {
  it('code persists after create (re-fetch by id)', async () => {
    const { data: createData } = await createGroup({
      name: `Persist-${uid('g')}`,
      code: 'PERSIST',
    })
    const groupId = createData.group.id

    // Re-fetch from server
    const res = await gw.fetchAs(USER_ADMIN, `/host-groups/${groupId}`)
    const data = await parseBody(res)
    expect(data.group.code).toBe('PERSIST')
  })

  it('code persists after update (re-fetch from list)', async () => {
    const { data: createData } = await createGroup({
      name: `PersistUpd-${uid('g')}`,
    })
    const groupId = createData.group.id

    // Update code
    await gw.fetchAs(USER_ADMIN, `/host-groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify({ code: 'AFTER_UPD' }),
    })

    // Re-fetch via list
    const listRes = await gw.fetchAs(USER_ADMIN, '/host-groups')
    const listData = await parseBody(listRes)
    const found = listData.groups.find((g: any) => g.id === groupId)
    expect(found).toBeDefined()
    expect(found.code).toBe('AFTER_UPD')
  })
})

// ─── HIERARCHY with code ─────────────────────────────────

describe('HostGroup Hierarchy — parent/child with code', () => {
  it('creates child group with code under a parent with code', async () => {
    const { data: parentData } = await createGroup({
      name: `Parent-${uid('p')}`,
      code: 'ROOT',
    })
    const parentId = parentData.group.id

    const { res, data } = await createGroup({
      name: `Child-${uid('c')}`,
      code: 'CHILD',
      parentId,
    })
    expect(res.ok).toBe(true)
    expect(data.group.code).toBe('CHILD')
    expect(data.group.parentId).toBe(parentId)
  })
})
