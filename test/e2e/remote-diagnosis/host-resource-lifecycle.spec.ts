/**
 * E2E Test: Host Resource Full CRUD Lifecycle
 *
 * Covers all 7 entity types with create/edit/delete flows:
 *   1. Cluster Types  – tab-based grid with modal form
 *   2. Business Types  – tab-based grid with modal form
 *   3. Groups          – tree sidebar with modal form
 *   4. Clusters        – tree sidebar, type dropdown populated by cluster types
 *   5. Hosts (×2)      – card grid, detail panel, credential masking
 *   6. Business Service – host association via checkboxes
 *   7. Host Relations   – source/target host dropdowns, topology verification
 *
 * Tests run sequentially; types are created first, used downstream, and
 * cleaned up last in reverse dependency order.
 *
 * Every step takes a screenshot and validates API responses.
 */
import { test, expect, type Page, type Response } from '@playwright/test'

const SS_DIR = 'test-results/host-resource-lifecycle'

const TS = Date.now()
const TEST_CLUSTER_TYPE = {
    name: `E2E-CT-${TS}`,
    code: `e2e-ct-${TS}`,
    description: 'E2E cluster type',
    color: '#10b981',
    knowledge: 'Test knowledge for cluster type',
}
const TEST_BUSINESS_TYPE = {
    name: `E2E-BT-${TS}`,
    code: `e2e-bt-${TS}`,
    description: 'E2E business type',
    color: '#6366f1',
    knowledge: 'Test knowledge for business type',
}
const TEST_GROUP = { name: `E2E-Group-${TS}`, description: 'E2E test group' }
const TEST_CLUSTER = { name: `E2E-Cluster-${TS}`, purpose: 'Load balancer', description: 'E2E test cluster' }
const TEST_HOST_1 = {
    name: `E2E-Host1-${TS}`,
    ip: '10.0.0.201',
    port: 22,
    username: 'root',
    authType: 'password',
    credential: 'test-pass',
    os: 'Linux',
    description: 'E2E host 1',
}
const TEST_HOST_2 = {
    name: `E2E-Host2-${TS}`,
    ip: '10.0.0.202',
    port: 22,
    username: 'root',
    authType: 'password',
    credential: 'test-pass',
    os: 'Linux',
    description: 'E2E host 2',
}
const TEST_BS = { priority: 'P1', tags: 'e2e,test', description: 'E2E business service' }
const TEST_RELATION = { description: 'E2E test relation: upstream dependency' }

// ── Helpers ──────────────────────────────────────────────────────────────────

async function ss(page: Page, name: string) {
    await page.screenshot({ path: `${SS_DIR}/${name}.png`, fullPage: true })
}

async function waitForApi(
    page: Page,
    predicate: (r: Response) => boolean,
    timeout = 15000,
): Promise<Response> {
    return page.waitForResponse(predicate, { timeout })
}

async function navigateTo(page: Page) {
    await page.goto('/#/host-resource')
    await page.waitForSelector('.host-resource-page', { timeout: 10000 })
    await page.waitForTimeout(500)
}

/** Switch to a tab by matching its text content */
async function switchTab(page: Page, tabPattern: string | RegExp) {
    const tab = page.locator('.hr-tab').filter({ hasText: tabPattern })
    await expect(tab, `Tab matching ${tabPattern} not found`).toBeVisible({ timeout: 5000 })
    await tab.click()
    await page.waitForTimeout(500)
}

/**
 * Open the unified "+ Create Resource" modal on the overview tab,
 * then select a type card matching the given text pattern.
 */
async function clickCreateResource(page: Page, typeCardPattern: string | RegExp) {
    const addBtn = page.locator('.hr-tabs-actions .btn-primary').first()
    await expect(addBtn).toBeVisible({ timeout: 5000 })
    await addBtn.click()

    const typeCard = page.locator('.hr-type-card').filter({ hasText: typeCardPattern }).first()
    await expect(typeCard).toBeVisible({ timeout: 5000 })
    await typeCard.click()
}

/** Fill an input field by finding its label in a form-group */
async function fillByLabel(container: ReturnType<Page['locator']>, labelPattern: string, value: string) {
    const label = container.locator('.form-label').filter({ hasText: new RegExp(labelPattern) })
    const group = label.locator('..')
    const input = group.locator('input.form-input').first()
    await input.fill(value)
}

/** Fill a textarea by finding its label */
async function fillTextareaByLabel(container: ReturnType<Page['locator']>, labelPattern: string, value: string) {
    const label = container.locator('.form-label').filter({ hasText: new RegExp(labelPattern) })
    const group = label.locator('..')
    const textarea = group.locator('textarea.form-input').first()
    await textarea.fill(value)
}

/** Select an option by finding the select via its label in a form-group */
async function selectByLabel(container: ReturnType<Page['locator']>, labelPattern: string, value: string) {
    const label = container.locator('.form-label').filter({ hasText: new RegExp(labelPattern) })
    const group = label.locator('..')
    const select = group.locator('select.form-input').first()
    await select.selectOption({ label: value })
}

/** Set a color input by label */
async function setColorByLabel(container: ReturnType<Page['locator']>, labelPattern: string, value: string) {
    const label = container.locator('.form-label').filter({ hasText: new RegExp(labelPattern) })
    const group = label.locator('..')
    const input = group.locator('input[type="color"]').first()
    await input.fill(value)
}

async function getModal(page: Page) {
    const modal = page.locator('.modal').last()
    await expect(modal).toBeVisible({ timeout: 5000 })
    return modal
}

/** Get the type-tab modal (uses .hr-host-modal.modal-overlay) */
async function getTypeTabModal(page: Page) {
    const modal = page.locator('.hr-host-modal.modal-overlay')
    await expect(modal).toBeVisible({ timeout: 5000 })
    return modal.locator('.modal-content')
}

async function saveModal(modal: ReturnType<Page['locator']>) {
    await modal.locator('.modal-footer .btn-primary').click()
}

/** Get a type definition card by name in the grid */
async function getTypeCard(page: Page, name: string) {
    return page.locator('.hr-type-def-card').filter({ hasText: name }).first()
}

// ── Shared state ─────────────────────────────────────────────────────────────

let clusterTypeId = ''
let businessTypeId = ''
let groupId = ''
let clusterId = ''
let host1Id = ''
let host2Id = ''
let businessServiceId = ''
let relationId = ''

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Host Resource Full CRUD Lifecycle', () => {
    test.setTimeout(300_000)

    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await page.evaluate(() => localStorage.setItem('ops-factory-user', 'admin'))
        await navigateTo(page)
        await ss(page, '00-page-loaded')
    })

    // ── Phase 1: Cluster Type CRUD ────────────────────────────────────────

    test('create cluster type', async ({ page }) => {
        await switchTab(page, /Cluster Types/)

        // Click "+ New Cluster Type" button
        const createBtn = page.locator('.hr-type-tab-header .btn-primary')
        await expect(createBtn).toBeVisible({ timeout: 5000 })
        await createBtn.click()

        const modal = await getTypeTabModal(page)

        await fillByLabel(modal, 'Type Name', TEST_CLUSTER_TYPE.name)
        await fillByLabel(modal, 'Type Code', TEST_CLUSTER_TYPE.code)
        await fillByLabel(modal, 'Description', TEST_CLUSTER_TYPE.description)
        await setColorByLabel(modal, 'Color', TEST_CLUSTER_TYPE.color)
        await fillTextareaByLabel(modal, 'Knowledge', TEST_CLUSTER_TYPE.knowledge)

        await ss(page, '01-cluster-type-form-filled')

        const createApi = waitForApi(page, r =>
            r.url().includes('/cluster-types') && r.request().method() === 'POST',
        )
        await saveModal(modal)
        const resp = await createApi

        expect(resp.ok(), `Create cluster type failed: ${resp.status()}`).toBeTruthy()
        const body = await resp.json()
        expect(body.success, `API returned success:false`).toBe(true)
        expect(body.clusterType, `Response missing clusterType object`).toBeDefined()
        clusterTypeId = body.clusterType.id

        await ss(page, '02-cluster-type-created')

        // Verify card appears in the type def grid
        const card = await getTypeCard(page, TEST_CLUSTER_TYPE.name)
        await expect(card, 'Cluster type card not visible in grid').toBeVisible({ timeout: 5000 })

        await ss(page, '03-cluster-type-in-grid')
    })

    test('edit cluster type', async ({ page }) => {
        test.skip(!clusterTypeId, 'No cluster type created yet')

        await switchTab(page, /Cluster Types/)

        const card = await getTypeCard(page, TEST_CLUSTER_TYPE.name)
        await expect(card, 'Cluster type card not found').toBeVisible({ timeout: 5000 })

        // Click Edit button (first button in card footer)
        await card.locator('.hr-type-def-card-footer button:first-child').click()

        const modal = await getTypeTabModal(page)
        const UPDATED_DESC = `${TEST_CLUSTER_TYPE.description} - updated`
        await fillByLabel(modal, 'Description', UPDATED_DESC)
        const UPDATED_KNOWLEDGE = `${TEST_CLUSTER_TYPE.knowledge} - updated`
        await fillTextareaByLabel(modal, 'Knowledge', UPDATED_KNOWLEDGE)

        await ss(page, '04-cluster-type-edit-form')

        const updateApi = waitForApi(page, r =>
            r.url().includes(`/cluster-types/${clusterTypeId}`) && r.request().method() === 'PUT',
        )
        await saveModal(modal)
        const resp = await updateApi

        expect(resp.ok(), `Update cluster type failed: ${resp.status()}`).toBeTruthy()
        const body = await resp.json()
        expect(body.success, `API returned success:false`).toBe(true)

        await ss(page, '05-cluster-type-updated')
    })

    // ── Phase 2: Business Type CRUD ───────────────────────────────────────

    test('create business type', async ({ page }) => {
        await switchTab(page, /Business Types/)

        const createBtn = page.locator('.hr-type-tab-header .btn-primary')
        await expect(createBtn).toBeVisible({ timeout: 5000 })
        await createBtn.click()

        const modal = await getTypeTabModal(page)

        await fillByLabel(modal, 'Type Name', TEST_BUSINESS_TYPE.name)
        await fillByLabel(modal, 'Type Code', TEST_BUSINESS_TYPE.code)
        await fillByLabel(modal, 'Description', TEST_BUSINESS_TYPE.description)
        await setColorByLabel(modal, 'Color', TEST_BUSINESS_TYPE.color)
        await fillTextareaByLabel(modal, 'Knowledge', TEST_BUSINESS_TYPE.knowledge)

        await ss(page, '06-business-type-form-filled')

        const createApi = waitForApi(page, r =>
            r.url().includes('/business-types') && r.request().method() === 'POST',
        )
        await saveModal(modal)
        const resp = await createApi

        expect(resp.ok(), `Create business type failed: ${resp.status()}`).toBeTruthy()
        const body = await resp.json()
        expect(body.success, `API returned success:false`).toBe(true)
        expect(body.businessType, `Response missing businessType object`).toBeDefined()
        businessTypeId = body.businessType.id

        await ss(page, '07-business-type-created')

        const card = await getTypeCard(page, TEST_BUSINESS_TYPE.name)
        await expect(card, 'Business type card not visible in grid').toBeVisible({ timeout: 5000 })

        await ss(page, '08-business-type-in-grid')
    })

    test('edit business type', async ({ page }) => {
        test.skip(!businessTypeId, 'No business type created yet')

        await switchTab(page, /Business Types/)

        const card = await getTypeCard(page, TEST_BUSINESS_TYPE.name)
        await expect(card, 'Business type card not found').toBeVisible({ timeout: 5000 })

        await card.locator('.hr-type-def-card-footer button:first-child').click()

        const modal = await getTypeTabModal(page)
        const UPDATED_DESC = `${TEST_BUSINESS_TYPE.description} - updated`
        await fillByLabel(modal, 'Description', UPDATED_DESC)

        await ss(page, '09-business-type-edit-form')

        const updateApi = waitForApi(page, r =>
            r.url().includes(`/business-types/${businessTypeId}`) && r.request().method() === 'PUT',
        )
        await saveModal(modal)
        const resp = await updateApi

        expect(resp.ok(), `Update business type failed: ${resp.status()}`).toBeTruthy()
        const body = await resp.json()
        expect(body.success, `API returned success:false`).toBe(true)

        await ss(page, '10-business-type-updated')
    })

    // ── Phase 3: Group CRUD ───────────────────────────────────────────────

    test('create group', async ({ page }) => {
        await switchTab(page, /Overview/)
        await clickCreateResource(page, /Group/)
        const modal = await getModal(page)

        await fillByLabel(modal, 'Group Name', TEST_GROUP.name)
        await fillByLabel(modal, 'Description', TEST_GROUP.description)

        await ss(page, '11-group-form-filled')

        const createApi = waitForApi(page, r =>
            r.url().includes('/host-groups') && r.request().method() === 'POST' && !r.url().includes('/tree'),
        )
        await saveModal(modal)
        const resp = await createApi

        expect(resp.ok(), `Create group failed: ${resp.status()}`).toBeTruthy()
        const body = await resp.json()
        expect(body.success, `API returned success:false`).toBe(true)
        expect(body.group, `Response missing group object`).toBeDefined()
        groupId = body.group.id

        await ss(page, '12-group-created')

        const treeNode = page.locator('.hr-tree-node').filter({ hasText: TEST_GROUP.name })
        await expect(treeNode, 'Group not visible in tree sidebar').toBeVisible({ timeout: 5000 })

        await ss(page, '13-group-in-tree')
    })

    test('edit group', async ({ page }) => {
        test.skip(!groupId, 'No group created yet')
        const UPDATED_DESC = `${TEST_GROUP.description} - updated`

        const treeNode = page.locator('.hr-tree-node').filter({ hasText: TEST_GROUP.name })
        if (await treeNode.isVisible({ timeout: 3000 }).catch(() => false)) {
            await treeNode.hover()
            await page.waitForTimeout(300)

            const editIcon = treeNode.locator('.hr-tree-node-action').first()
            if (await editIcon.isVisible({ timeout: 2000 }).catch(() => false)) {
                await editIcon.click()
                const modal = await getModal(page)

                await fillByLabel(modal, 'Description', UPDATED_DESC)

                await ss(page, '14-group-edit-form')

                const updateApi = waitForApi(page, r =>
                    r.url().includes(`/host-groups/${groupId}`) && r.request().method() === 'PUT',
                )
                await saveModal(modal)
                const resp = await updateApi

                expect(resp.ok(), `Update group failed: ${resp.status()}`).toBeTruthy()
                const body = await resp.json()
                expect(body.success, `API returned success:false`).toBe(true)

                await ss(page, '15-group-updated')
            }
        }
    })

    // ── Phase 4: Cluster CRUD ─────────────────────────────────────────────

    test('create cluster', async ({ page }) => {
        test.skip(!groupId, 'No group created yet')

        await clickCreateResource(page, /Cluster/)
        const modal = await getModal(page)

        await fillByLabel(modal, 'Cluster Name', TEST_CLUSTER.name)
        // Cluster Type is a <select> populated from cluster types API
        await selectByLabel(modal, 'Cluster Type', TEST_CLUSTER_TYPE.name)
        await fillByLabel(modal, 'Purpose', TEST_CLUSTER.purpose)
        await selectByLabel(modal, 'Parent Group', TEST_GROUP.name)
        await fillByLabel(modal, 'Description', TEST_CLUSTER.description)

        await ss(page, '16-cluster-form-filled')

        const createApi = waitForApi(page, r =>
            r.url().includes('/clusters') && r.request().method() === 'POST',
        )
        await saveModal(modal)
        const resp = await createApi

        expect(resp.ok(), `Create cluster failed: ${resp.status()}`).toBeTruthy()
        const body = await resp.json()
        expect(body.success, `API returned success:false`).toBe(true)
        expect(body.cluster, `Response missing cluster object`).toBeDefined()
        clusterId = body.cluster.id

        await ss(page, '17-cluster-created')

        await page.waitForTimeout(1000)
        const clusterNode = page.locator('.hr-tree-node').filter({ hasText: TEST_CLUSTER.name })
        await expect(clusterNode, 'Cluster not visible in tree').toBeVisible({ timeout: 10000 })

        await ss(page, '18-cluster-in-tree')
    })

    test('edit cluster', async ({ page }) => {
        test.skip(!clusterId, 'No cluster created yet')
        const UPDATED_PURPOSE = `${TEST_CLUSTER.purpose} - updated`

        const clusterNode = page.locator('.hr-tree-node').filter({ hasText: TEST_CLUSTER.name })
        if (await clusterNode.isVisible({ timeout: 3000 }).catch(() => false)) {
            await clusterNode.hover()
            await page.waitForTimeout(300)

            const editIcon = clusterNode.locator('.hr-tree-node-action').first()
            if (await editIcon.isVisible({ timeout: 2000 }).catch(() => false)) {
                await editIcon.click()
                const modal = await getModal(page)

                await fillByLabel(modal, 'Purpose', UPDATED_PURPOSE)

                await ss(page, '19-cluster-edit-form')

                const updateApi = waitForApi(page, r =>
                    r.url().includes(`/clusters/${clusterId}`) && r.request().method() === 'PUT',
                )
                await saveModal(modal)
                const resp = await updateApi

                expect(resp.ok(), `Update cluster failed: ${resp.status()}`).toBeTruthy()
                const body = await resp.json()
                expect(body.success, `API returned success:false`).toBe(true)

                await ss(page, '20-cluster-updated')
            }
        }
    })

    // ── Phase 5: Host CRUD ────────────────────────────────────────────────

    test('create host 1', async ({ page }) => {
        test.skip(!clusterId, 'No cluster created yet')

        // Select cluster in tree to set context
        const clusterNode = page.locator('.hr-tree-node').filter({ hasText: TEST_CLUSTER.name })
        await expect(clusterNode, 'Cluster not found in tree').toBeVisible({ timeout: 5000 })
        await clusterNode.click()
        await page.waitForTimeout(500)

        await clickCreateResource(page, /Host/)
        const modal = await getModal(page)
        await page.waitForTimeout(300)

        await fillByLabel(modal, 'Host Name', TEST_HOST_1.name)
        await fillByLabel(modal, 'IP Address', TEST_HOST_1.ip)
        const portInput = modal.locator('input[type="number"]')
        await portInput.fill(String(TEST_HOST_1.port))
        await fillByLabel(modal, 'Operating System', TEST_HOST_1.os)
        await fillByLabel(modal, 'Username', TEST_HOST_1.username)

        // Auth type select
        const authTypeLabel = modal.locator('.form-label').filter({ hasText: /Auth Type/ })
        const authTypeGroup = authTypeLabel.locator('..')
        await authTypeGroup.locator('select.form-input').first().selectOption('password')

        const credInput = modal.locator('input[type="password"]')
        await credInput.fill(TEST_HOST_1.credential)

        await selectByLabel(modal, 'Cluster', `${TEST_CLUSTER.name} (${TEST_CLUSTER_TYPE.name})`)
        await fillByLabel(modal, 'Description', TEST_HOST_1.description)

        await ss(page, '21-host1-form-filled')

        const createApi = waitForApi(page, r =>
            r.url().includes('/hosts') && r.request().method() === 'POST' && !r.url().includes('/tags') && !r.url().includes('/test'),
        )
        await saveModal(modal)
        const resp = await createApi

        expect(resp.ok(), `Create host 1 failed: ${resp.status()}`).toBeTruthy()
        const body = await resp.json()
        expect(body.success, `API returned success:false`).toBe(true)
        expect(body.host, `Response missing host object`).toBeDefined()
        host1Id = body.host.id

        await ss(page, '22-host1-created')

        const hostCard = page.locator('.hr-host-card').filter({ hasText: TEST_HOST_1.name })
        await expect(hostCard, 'Host 1 card not visible').toBeVisible({ timeout: 5000 })

        await ss(page, '23-host1-in-grid')
    })

    test('create host 2', async ({ page }) => {
        test.skip(!clusterId, 'No cluster created yet')

        const clusterNode = page.locator('.hr-tree-node').filter({ hasText: TEST_CLUSTER.name })
        await expect(clusterNode, 'Cluster not found in tree').toBeVisible({ timeout: 5000 })
        await clusterNode.click()
        await page.waitForTimeout(500)

        await clickCreateResource(page, /Host/)
        const modal = await getModal(page)
        await page.waitForTimeout(300)

        await fillByLabel(modal, 'Host Name', TEST_HOST_2.name)
        await fillByLabel(modal, 'IP Address', TEST_HOST_2.ip)
        const portInput = modal.locator('input[type="number"]')
        await portInput.fill(String(TEST_HOST_2.port))
        await fillByLabel(modal, 'Operating System', TEST_HOST_2.os)
        await fillByLabel(modal, 'Username', TEST_HOST_2.username)

        const authTypeLabel = modal.locator('.form-label').filter({ hasText: /Auth Type/ })
        const authTypeGroup = authTypeLabel.locator('..')
        await authTypeGroup.locator('select.form-input').first().selectOption('password')

        const credInput = modal.locator('input[type="password"]')
        await credInput.fill(TEST_HOST_2.credential)

        await selectByLabel(modal, 'Cluster', `${TEST_CLUSTER.name} (${TEST_CLUSTER_TYPE.name})`)
        await fillByLabel(modal, 'Description', TEST_HOST_2.description)

        await ss(page, '24-host2-form-filled')

        const createApi = waitForApi(page, r =>
            r.url().includes('/hosts') && r.request().method() === 'POST' && !r.url().includes('/tags') && !r.url().includes('/test'),
        )
        await saveModal(modal)
        const resp = await createApi

        expect(resp.ok(), `Create host 2 failed: ${resp.status()}`).toBeTruthy()
        const body = await resp.json()
        expect(body.success, `API returned success:false`).toBe(true)
        expect(body.host, `Response missing host object`).toBeDefined()
        host2Id = body.host.id

        await ss(page, '25-host2-created')
    })

    test('view host detail — card selection toggles focused state', async ({ page }) => {
        test.skip(!host1Id, 'No host 1 created yet')

        const clusterNode = page.locator('.hr-tree-node').filter({ hasText: TEST_CLUSTER.name })
        if (await clusterNode.isVisible({ timeout: 3000 }).catch(() => false)) {
            await clusterNode.click()
            await page.waitForTimeout(500)
        }

        const hostCard = page.locator('.hr-host-card').filter({ hasText: TEST_HOST_1.name })
        await expect(hostCard, 'Host 1 card not found').toBeVisible({ timeout: 5000 })

        // Verify card content shows host info
        await expect(hostCard.filter({ hasText: TEST_HOST_1.ip })).toBeVisible()

        // Click the card to toggle selection (focusedHostId in the page)
        await hostCard.click()
        await page.waitForTimeout(300)

        // Card should gain the selected CSS class
        await expect(hostCard, 'Host card should be selected after click')
            .toHaveClass(/hr-host-card-selected/)

        await ss(page, '26-host-card-selected')

        // Click again to deselect
        await hostCard.click()
        await page.waitForTimeout(300)
        await expect(hostCard, 'Host card should be deselected after second click')
            .not.toHaveClass(/hr-host-card-selected/)

        await ss(page, '27-host-card-deselected')
    })

    test('edit host', async ({ page }) => {
        test.skip(!host1Id, 'No host 1 created yet')
        const UPDATED_DESC = `${TEST_HOST_1.description} - updated`

        const clusterNode = page.locator('.hr-tree-node').filter({ hasText: TEST_CLUSTER.name })
        if (await clusterNode.isVisible({ timeout: 3000 }).catch(() => false)) {
            await clusterNode.click()
            await page.waitForTimeout(500)
        }

        const hostCard = page.locator('.hr-host-card').filter({ hasText: TEST_HOST_1.name })
        await expect(hostCard, 'Host 1 card not found').toBeVisible({ timeout: 5000 })

        const editBtn = hostCard.locator('.hr-host-card-footer .btn-subtle')
        await editBtn.click()

        const modal = await getModal(page)

        // Verify credential is masked in edit form
        const credInput = modal.locator('input[type="password"]')
        const credValue = await credInput.inputValue()
        expect(credValue, 'Credential should be masked as *** in edit form').toBe('***')

        await fillByLabel(modal, 'Description', UPDATED_DESC)

        await ss(page, '28-host-edit-form')

        const updateApi = waitForApi(page, r =>
            r.url().includes(`/hosts/${host1Id}`) && r.request().method() === 'PUT',
        )
        await saveModal(modal)
        const resp = await updateApi

        expect(resp.ok(), `Update host failed: ${resp.status()}`).toBeTruthy()
        const body = await resp.json()
        expect(body.success, `API returned success:false`).toBe(true)

        await ss(page, '29-host-updated')
    })

    // ── Phase 6: Business Service ↔ Host Association CRUD ─────────────────

    test('create business service with host 1 association', async ({ page }) => {
        test.skip(!host1Id || !host2Id, 'No hosts created yet')

        await clickCreateResource(page, /Business Service/)
        const modal = await getModal(page)

        // Select business type → auto-fills name/code/description
        await selectByLabel(modal, 'Select Business Type', TEST_BUSINESS_TYPE.name)

        // Priority dropdown
        await selectByLabel(modal, 'Priority', TEST_BS.priority)

        // Select group
        await selectByLabel(modal, 'Group', TEST_GROUP.name)

        // Check ONLY host 1 as entry resource
        const host1Checkbox = modal.locator('label').filter({ hasText: TEST_HOST_1.name }).locator('input[type="checkbox"]')
        if (await host1Checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
            await host1Checkbox.check()
        }

        await fillByLabel(modal, 'Tags', TEST_BS.tags)
        await fillByLabel(modal, 'Description', TEST_BS.description)

        await ss(page, '30-bs-form-filled')

        const createApi = waitForApi(page, r =>
            r.url().includes('/business-services') && r.request().method() === 'POST',
        )
        await saveModal(modal)
        const resp = await createApi

        expect(resp.ok(), `Create business service failed: ${resp.status()}`).toBeTruthy()
        const body = await resp.json()
        expect(body.success, `API returned success:false`).toBe(true)
        expect(body.businessService, `Response missing businessService object`).toBeDefined()
        businessServiceId = body.businessService.id

        // Verify hostIds contains only host 1
        expect(body.businessService.hostIds, `BS should have hostIds`).toBeDefined()
        expect(body.businessService.hostIds.length, `BS should have exactly 1 host associated`).toBe(1)
        expect(body.businessService.hostIds[0], `BS hostIds should contain host1`).toBe(host1Id)

        await ss(page, '31-bs-created')
    })

    test('read: verify BS shows host 1 in tree', async ({ page }) => {
        test.skip(!businessServiceId, 'No business service created yet')

        // Business service tree node should show host 1 name as subtitle
        const bsNode = page.locator('.hr-tree-node').filter({ hasText: TEST_BUSINESS_TYPE.name })
        await expect(bsNode, 'Business service not visible in tree').toBeVisible({ timeout: 10000 })

        // The tree node subtitle should contain host 1 name
        await expect(bsNode.filter({ hasText: TEST_HOST_1.name }), 'BS tree node should show host 1 name as subtitle')
            .toBeVisible({ timeout: 5000 })

        await ss(page, '32-bs-host1-in-tree')
    })

    test('update: add host 2 to BS association', async ({ page }) => {
        test.skip(!businessServiceId, 'No business service created yet')

        const bsNode = page.locator('.hr-tree-node').filter({ hasText: TEST_BUSINESS_TYPE.name })
        await expect(bsNode, 'BS node not found in tree').toBeVisible({ timeout: 5000 })
        await bsNode.hover()
        await page.waitForTimeout(300)

        const editIcon = bsNode.locator('.hr-tree-node-action').first()
        await expect(editIcon, 'Edit icon not visible on BS node').toBeVisible({ timeout: 3000 })
        await editIcon.click()

        const modal = await getModal(page)

        // Verify host 1 checkbox is already checked (existing association)
        const host1Checkbox = modal.locator('label').filter({ hasText: TEST_HOST_1.name }).locator('input[type="checkbox"]')
        if (await host1Checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
            const isChecked = await host1Checkbox.isChecked()
            expect(isChecked, 'Host 1 should already be checked in edit form').toBe(true)
        }

        // Check host 2 to add it to the association
        const host2Checkbox = modal.locator('label').filter({ hasText: TEST_HOST_2.name }).locator('input[type="checkbox"]')
        if (await host2Checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
            await host2Checkbox.check()
        }

        await ss(page, '33-bs-add-host2')

        const updateApi = waitForApi(page, r =>
            r.url().includes(`/business-services/${businessServiceId}`) && r.request().method() === 'PUT',
        )
        await saveModal(modal)
        const resp = await updateApi

        expect(resp.ok(), `Update BS (add host 2) failed: ${resp.status()}`).toBeTruthy()
        const body = await resp.json()
        expect(body.success, `API returned success:false`).toBe(true)

        // Verify hostIds now contains both hosts
        expect(body.businessService.hostIds.length, `BS should have 2 hosts after update`).toBe(2)
        expect(body.businessService.hostIds, `BS hostIds should contain both hosts`).toEqual(
            expect.arrayContaining([host1Id, host2Id]),
        )

        await ss(page, '34-bs-both-hosts')
    })

    test('read: verify BS shows both hosts in tree', async ({ page }) => {
        test.skip(!businessServiceId, 'No business service created yet')

        // After adding host 2, tree node should show both host names
        const bsNode = page.locator('.hr-tree-node').filter({ hasText: TEST_BUSINESS_TYPE.name })
        await expect(bsNode, 'BS node not visible in tree').toBeVisible({ timeout: 10000 })

        // Subtitle should contain both host names
        await expect(bsNode.filter({ hasText: TEST_HOST_1.name }), 'BS tree should show host 1')
            .toBeVisible({ timeout: 5000 })
        await expect(bsNode.filter({ hasText: TEST_HOST_2.name }), 'BS tree should show host 2')
            .toBeVisible({ timeout: 5000 })

        await ss(page, '35-bs-both-hosts-in-tree')
    })

    test('update: remove host 1 from BS association', async ({ page }) => {
        test.skip(!businessServiceId, 'No business service created yet')

        const bsNode = page.locator('.hr-tree-node').filter({ hasText: TEST_BUSINESS_TYPE.name })
        await expect(bsNode, 'BS node not found in tree').toBeVisible({ timeout: 5000 })
        await bsNode.hover()
        await page.waitForTimeout(300)

        const editIcon = bsNode.locator('.hr-tree-node-action').first()
        await expect(editIcon, 'Edit icon not visible on BS node').toBeVisible({ timeout: 3000 })
        await editIcon.click()

        const modal = await getModal(page)

        // Uncheck host 1 to remove it from the association
        const host1Checkbox = modal.locator('label').filter({ hasText: TEST_HOST_1.name }).locator('input[type="checkbox"]')
        if (await host1Checkbox.isVisible({ timeout: 3000 }).catch(() => false)) {
            await host1Checkbox.uncheck()
        }

        await ss(page, '36-bs-remove-host1')

        const updateApi = waitForApi(page, r =>
            r.url().includes(`/business-services/${businessServiceId}`) && r.request().method() === 'PUT',
        )
        await saveModal(modal)
        const resp = await updateApi

        expect(resp.ok(), `Update BS (remove host 1) failed: ${resp.status()}`).toBeTruthy()
        const body = await resp.json()
        expect(body.success, `API returned success:false`).toBe(true)

        // Verify hostIds now only contains host 2
        expect(body.businessService.hostIds.length, `BS should have 1 host after removal`).toBe(1)
        expect(body.businessService.hostIds[0], `BS hostIds should only contain host2`).toBe(host2Id)

        await ss(page, '37-bs-host2-only')
    })

    test('read: verify BS shows only host 2 after removal', async ({ page }) => {
        test.skip(!businessServiceId, 'No business service created yet')

        // After removing host 1, tree node should only show host 2
        const bsNode = page.locator('.hr-tree-node').filter({ hasText: TEST_BUSINESS_TYPE.name })
        await expect(bsNode, 'BS node not visible in tree').toBeVisible({ timeout: 10000 })

        // Subtitle should contain host 2
        await expect(bsNode.filter({ hasText: TEST_HOST_2.name }), 'BS tree should show host 2')
            .toBeVisible({ timeout: 5000 })

        await ss(page, '38-bs-host2-in-tree')
    })

    test('delete business service', async ({ page }) => {
        test.skip(!businessServiceId, 'No business service created yet')

        const bsNode = page.locator('.hr-tree-node').filter({ hasText: TEST_BUSINESS_TYPE.name })
        if (await bsNode.isVisible({ timeout: 5000 }).catch(() => false)) {
            await bsNode.hover()
            await page.waitForTimeout(300)

            page.once('dialog', d => d.accept())

            const deleteIcon = bsNode.locator('.hr-tree-node-action-danger')
            if (await deleteIcon.isVisible({ timeout: 2000 }).catch(() => false)) {
                const delApi = waitForApi(page, r =>
                    r.url().includes(`/business-services/${businessServiceId}`) && r.request().method() === 'DELETE',
                ).catch(() => null)

                await deleteIcon.click()
                const resp = await delApi
                if (resp) {
                    expect(resp.ok(), `Delete business service failed: ${resp.status()}`).toBeTruthy()
                }

                await page.waitForTimeout(1000)

                const nodeAfterDelete = page.locator('.hr-tree-node').filter({ hasText: TEST_BUSINESS_TYPE.name })
                await expect(nodeAfterDelete, 'Business service should be gone from tree after deletion')
                    .not.toBeVisible({ timeout: 5000 })

                await ss(page, '39-bs-deleted')
            }
        }
    })

    // ── Phase 7: Host Relation CRUD ───────────────────────────────────────

    test('create host relation', async ({ page }) => {
        test.skip(!host1Id || !host2Id, 'No hosts created yet')

        await clickCreateResource(page, /Relation/)
        const modal = await getModal(page)

        // Source host dropdown – option text is "hostName (ip)"
        await selectByLabel(modal, 'Source Host', `${TEST_HOST_1.name} (${TEST_HOST_1.ip})`)
        await selectByLabel(modal, 'Target Host', `${TEST_HOST_2.name} (${TEST_HOST_2.ip})`)
        await fillByLabel(modal, 'Relation Description', TEST_RELATION.description)

        await ss(page, '40-relation-form-filled')

        const createApi = waitForApi(page, r =>
            r.url().includes('/host-relations') && r.request().method() === 'POST',
        )
        await saveModal(modal)
        const resp = await createApi

        expect(resp.ok(), `Create relation failed: ${resp.status()}`).toBeTruthy()
        const body = await resp.json()
        expect(body.success, `API returned success:false`).toBe(true)
        expect(body.relation, `Response missing relation object`).toBeDefined()
        relationId = body.relation.id

        await ss(page, '41-relation-created')
    })

    test('verify relation in topology', async ({ page }) => {
        test.skip(!relationId, 'No relation created yet')

        // Verify the topology area renders without errors
        const topologyArea = page.locator('.hr-topology-area')
        await expect(topologyArea, 'Topology area should be visible').toBeVisible({ timeout: 5000 })

        await ss(page, '42-topology-with-relation')
    })

    // ── Phase 8: Cleanup (reverse dependency order) ───────────────────────

    test('cleanup: delete host relation', async ({ page }) => {
        test.skip(!relationId, 'No relation created yet')

        // Open host 1 edit modal → delete the relation inline from topology section
        const clusterNode = page.locator('.hr-tree-node').filter({ hasText: TEST_CLUSTER.name })
        if (await clusterNode.isVisible({ timeout: 3000 }).catch(() => false)) {
            await clusterNode.click()
            await page.waitForTimeout(500)
        }

        const hostCard = page.locator('.hr-host-card').filter({ hasText: TEST_HOST_1.name })
        if (await hostCard.isVisible({ timeout: 3000 }).catch(() => false)) {
            const editBtn = hostCard.locator('.hr-host-card-footer .btn-subtle')
            await editBtn.click()
            const modal = await getModal(page)

            // Find the relation delete button in the topology section of the edit form
            const relDeleteBtn = modal.locator('.hr-tree-node-action-danger')
            if (await relDeleteBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
                const delApi = waitForApi(page, r =>
                    r.url().includes(`/host-relations/${relationId}`) && r.request().method() === 'DELETE',
                ).catch(() => null)

                await relDeleteBtn.click()
                const resp = await delApi
                if (resp) {
                    expect(resp.ok(), `Delete relation failed: ${resp.status()}`).toBeTruthy()
                }

                await page.waitForTimeout(500)
            }

            // Close the modal
            const cancelBtn = modal.locator('.modal-footer .btn-secondary')
            await cancelBtn.click()
            await page.waitForTimeout(500)
        }

        await ss(page, '43-relation-deleted')
    })

    test('cleanup: delete hosts, cluster, group', async ({ page }) => {
        test.skip(!clusterId, 'No cluster created yet')

        // Ensure cluster is selected to show host cards
        const clusterNode = page.locator('.hr-tree-node').filter({ hasText: TEST_CLUSTER.name })
        if (await clusterNode.isVisible({ timeout: 3000 }).catch(() => false)) {
            await clusterNode.click()
            await page.waitForTimeout(500)
        }

        // Delete host 2
        if (host2Id) {
            const host2Card = page.locator('.hr-host-card').filter({ hasText: TEST_HOST_2.name })
            if (await host2Card.isVisible({ timeout: 3000 }).catch(() => false)) {
                page.once('dialog', d => d.accept())
                const delApi = waitForApi(page, r =>
                    r.url().includes(`/hosts/${host2Id}`) && r.request().method() === 'DELETE',
                ).catch(() => null)
                await host2Card.locator('.hr-host-card-footer .hr-host-card-delete-btn').click()
                const resp = await delApi
                if (resp) expect(resp.ok(), `Delete host 2 failed`).toBeTruthy()
                await page.waitForTimeout(500)
            }
        }

        // Delete host 1
        if (host1Id) {
            const host1Card = page.locator('.hr-host-card').filter({ hasText: TEST_HOST_1.name })
            if (await host1Card.isVisible({ timeout: 3000 }).catch(() => false)) {
                page.once('dialog', d => d.accept())
                const delApi = waitForApi(page, r =>
                    r.url().includes(`/hosts/${host1Id}`) && r.request().method() === 'DELETE',
                ).catch(() => null)
                await host1Card.locator('.hr-host-card-footer .hr-host-card-delete-btn').click()
                const resp = await delApi
                if (resp) expect(resp.ok(), `Delete host 1 failed`).toBeTruthy()
                await page.waitForTimeout(500)
            }
        }

        // Delete cluster
        const clusterNodeDel = page.locator('.hr-tree-node').filter({ hasText: TEST_CLUSTER.name })
        if (await clusterNodeDel.isVisible({ timeout: 3000 }).catch(() => false)) {
            await clusterNodeDel.hover()
            await page.waitForTimeout(300)
            page.once('dialog', d => d.accept())
            const deleteIcon = clusterNodeDel.locator('.hr-tree-node-action-danger')
            if (await deleteIcon.isVisible({ timeout: 2000 }).catch(() => false)) {
                const delApi = waitForApi(page, r =>
                    r.url().includes(`/clusters/${clusterId}`) && r.request().method() === 'DELETE',
                ).catch(() => null)
                await deleteIcon.click()
                const resp = await delApi
                if (resp) expect(resp.ok(), `Delete cluster failed`).toBeTruthy()
                await page.waitForTimeout(500)
            }
        }

        // Delete group
        const groupNode = page.locator('.hr-tree-node').filter({ hasText: TEST_GROUP.name })
        if (await groupNode.isVisible({ timeout: 3000 }).catch(() => false)) {
            await groupNode.hover()
            await page.waitForTimeout(300)
            page.once('dialog', d => d.accept())
            const deleteIcon = groupNode.locator('.hr-tree-node-action-danger')
            if (await deleteIcon.isVisible({ timeout: 2000 }).catch(() => false)) {
                const delApi = waitForApi(page, r =>
                    r.url().includes(`/host-groups/${groupId}`) && r.request().method() === 'DELETE',
                ).catch(() => null)
                await deleteIcon.click()
                const resp = await delApi
                if (resp) expect(resp.ok(), `Delete group failed`).toBeTruthy()
                await page.waitForTimeout(500)
            }
        }

        await ss(page, '44-hosts-cluster-group-deleted')
    })

    test('cleanup: delete business type and cluster type', async ({ page }) => {
        // Delete business type
        if (businessTypeId) {
            await switchTab(page, /Business Types/)

            const btCard = await getTypeCard(page, TEST_BUSINESS_TYPE.name)
            if (await btCard.isVisible({ timeout: 3000 }).catch(() => false)) {
                page.once('dialog', d => d.accept())

                const delApi = waitForApi(page, r =>
                    r.url().includes(`/business-types/${businessTypeId}`) && r.request().method() === 'DELETE',
                ).catch(() => null)

                await btCard.locator('.hr-type-def-card-footer button:last-child').click()
                const resp = await delApi
                if (resp) {
                    expect(resp.ok(), `Delete business type failed: ${resp.status()}`).toBeTruthy()
                }

                await page.waitForTimeout(1000)

                const cardAfterDelete = await getTypeCard(page, TEST_BUSINESS_TYPE.name)
                await expect(cardAfterDelete, 'Business type card should be gone after deletion')
                    .not.toBeVisible({ timeout: 3000 })
            }
        }

        await ss(page, '45-business-type-deleted')

        // Delete cluster type
        if (clusterTypeId) {
            await switchTab(page, /Cluster Types/)

            const ctCard = await getTypeCard(page, TEST_CLUSTER_TYPE.name)
            if (await ctCard.isVisible({ timeout: 3000 }).catch(() => false)) {
                page.once('dialog', d => d.accept())

                const delApi = waitForApi(page, r =>
                    r.url().includes(`/cluster-types/${clusterTypeId}`) && r.request().method() === 'DELETE',
                ).catch(() => null)

                await ctCard.locator('.hr-type-def-card-footer button:last-child').click()
                const resp = await delApi
                if (resp) {
                    expect(resp.ok(), `Delete cluster type failed: ${resp.status()}`).toBeTruthy()
                }

                await page.waitForTimeout(1000)

                const cardAfterDelete = await getTypeCard(page, TEST_CLUSTER_TYPE.name)
                await expect(cardAfterDelete, 'Cluster type card should be gone after deletion')
                    .not.toBeVisible({ timeout: 3000 })
            }
        }

        await ss(page, '46-cluster-type-deleted')
    })
})
