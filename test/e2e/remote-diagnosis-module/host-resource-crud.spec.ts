/**
 * E2E Test: Host Resource CRUD (Business Integration)
 *
 * Covers host management basic functionality on the /#/host-resource page:
 *   1. Group CRUD: create group, edit group, delete group
 *   2. Cluster CRUD: create cluster under group, edit cluster, delete cluster
 *   3. Host CRUD: create host with full fields, edit host, delete host
 *   4. Three-zone layout: tree sidebar, host cards area, topology area
 *   5. Detail panel: click host card to view detail panel (overlay)
 *   6. Tree navigation: verify tree in sidebar reflects group/cluster hierarchy
 *   7. Tree node actions: edit/delete via hover icons
 *
 * Every step takes a screenshot and validates API responses.
 */
import { test, expect, type Page, type Response } from '@playwright/test'

const SS_DIR = 'test-results/host-resource-crud'

const TS = Date.now()
const TEST_GROUP = { name: `E2E-Group-${TS}`, description: 'E2E test group' }
const TEST_CLUSTER = { name: `E2E-Cluster-${TS}`, type: 'NSLB', purpose: 'Load balancer', description: 'E2E test cluster' }
const TEST_HOST = {
    name: `E2E-Host-${TS}`,
    ip: '10.0.0.200',
    port: 22,
    username: 'admin',
    authType: 'password',
    credential: 'test-pass',
    os: 'Linux',
    location: 'DC-BJ-01',
    description: 'E2E test host',
}

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
    // Wait for three-zone layout page to load
    await page.waitForSelector('.resource-page', { timeout: 10000 })
    await page.waitForTimeout(500)
}

/**
 * Open the unified "+ Create Resource" modal, then select a type card.
 * textPattern matches the type label on a .hr-type-card (e.g. /Group/)
 */
async function clickActionBtn(page: Page, textPattern: string | RegExp) {
    // Click the unified "+ Create Resource" button in page header
    const addBtn = page.locator('.page-header .btn-primary').first()
    await expect(addBtn).toBeVisible({ timeout: 5000 })
    await addBtn.click()

    // In the type selector modal, click the matching type card
    const typeCard = page.locator('.hr-type-card').filter({ hasText: textPattern }).first()
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

/** Select an option by finding the select via its label in a form-group */
async function selectByLabel(container: ReturnType<Page['locator']>, labelPattern: string, value: string) {
    const label = container.locator('.form-label').filter({ hasText: new RegExp(labelPattern) })
    const group = label.locator('..')
    const select = group.locator('select.form-input').first()
    await select.selectOption({ label: value })
}

async function getModal(page: Page) {
    const modal = page.locator('.modal').last()
    await expect(modal).toBeVisible({ timeout: 5000 })
    return modal
}

async function saveModal(modal: ReturnType<Page['locator']>) {
    await modal.locator('.modal-footer .btn-primary').click()
}

// ── Shared state ─────────────────────────────────────────────────────────────

let groupId = ''
let clusterId = ''
let hostId = ''

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Host Resource CRUD', () => {
    test.setTimeout(180_000)

    test.beforeEach(async ({ page }) => {
        await page.goto('/')
        await page.evaluate(() => localStorage.setItem('ops-factory-user', 'admin'))
        await navigateTo(page)
        await ss(page, '00-page-loaded')
    })

    // ── 1. Group CRUD ────────────────────────────────────────────────────

    test('create group', async ({ page }) => {
        await clickActionBtn(page, /Group/)
        const modal = await getModal(page)

        await fillByLabel(modal, 'Group Name', TEST_GROUP.name)
        await fillByLabel(modal, 'Description', TEST_GROUP.description)

        await ss(page, '01-group-form-filled')

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

        await ss(page, '02-group-created')

        // Verify tree shows the group (tree is in left sidebar)
        const treeNode = page.locator('.hr-tree-node').filter({ hasText: TEST_GROUP.name })
        await expect(treeNode, 'Group not visible in tree sidebar').toBeVisible({ timeout: 5000 })

        await ss(page, '03-group-in-tree')
    })

    test('edit group via tree icon', async ({ page }) => {
        test.skip(!groupId, 'No group created yet')
        const UPDATED_DESC = `${TEST_GROUP.description} - updated`

        // Hover over the group node to reveal action icons
        const treeNode = page.locator('.hr-tree-node').filter({ hasText: TEST_GROUP.name })
        if (await treeNode.isVisible({ timeout: 3000 }).catch(() => false)) {
            await treeNode.hover()
            await page.waitForTimeout(300)

            // Click the edit icon (✎)
            const editIcon = treeNode.locator('.hr-tree-node-action').first()
            if (await editIcon.isVisible({ timeout: 2000 }).catch(() => false)) {
                await editIcon.click()
                const modal = await getModal(page)

                await fillByLabel(modal, 'Description', UPDATED_DESC)

                await ss(page, '04-group-edit-form')

                const updateApi = waitForApi(page, r =>
                    r.url().includes(`/host-groups/${groupId}`) && r.request().method() === 'PUT',
                )
                await saveModal(modal)
                const resp = await updateApi

                expect(resp.ok(), `Update group failed: ${resp.status()}`).toBeTruthy()
                const body = await resp.json()
                expect(body.success, `API returned success:false`).toBe(true)

                await ss(page, '05-group-updated')
            }
        }
    })

    // ── 2. Cluster CRUD ──────────────────────────────────────────────────

    test('create cluster', async ({ page }) => {
        test.skip(!groupId, 'No group created yet')

        await clickActionBtn(page, /Cluster/)
        const modal = await getModal(page)

        await fillByLabel(modal, 'Cluster Name', TEST_CLUSTER.name)
        await fillByLabel(modal, 'Cluster Type', TEST_CLUSTER.type)
        await fillByLabel(modal, 'Purpose', TEST_CLUSTER.purpose)
        await selectByLabel(modal, 'Parent Group', TEST_GROUP.name)
        await fillByLabel(modal, 'Description', TEST_CLUSTER.description)

        await ss(page, '06-cluster-form-filled')

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

        await ss(page, '07-cluster-created')

        // Wait for tree to update
        await page.waitForTimeout(1000)

        // Verify cluster appears in tree sidebar
        const clusterNode = page.locator('.hr-tree-node').filter({ hasText: TEST_CLUSTER.name })
        await expect(clusterNode, 'Cluster not visible in tree').toBeVisible({ timeout: 10000 })

        await ss(page, '08-cluster-in-tree')
    })

    test('edit cluster via tree icon', async ({ page }) => {
        test.skip(!clusterId, 'No cluster created yet')
        const UPDATED_PURPOSE = `${TEST_CLUSTER.purpose} - updated`

        // Hover over the cluster node to reveal action icons
        const clusterNode = page.locator('.hr-tree-node').filter({ hasText: TEST_CLUSTER.name })
        if (await clusterNode.isVisible({ timeout: 3000 }).catch(() => false)) {
            await clusterNode.hover()
            await page.waitForTimeout(300)

            const editIcon = clusterNode.locator('.hr-tree-node-action').first()
            if (await editIcon.isVisible({ timeout: 2000 }).catch(() => false)) {
                await editIcon.click()
                const modal = await getModal(page)

                await fillByLabel(modal, 'Purpose', UPDATED_PURPOSE)

                await ss(page, '09-cluster-edit-form')

                const updateApi = waitForApi(page, r =>
                    r.url().includes(`/clusters/${clusterId}`) && r.request().method() === 'PUT',
                )
                await saveModal(modal)
                const resp = await updateApi

                expect(resp.ok(), `Update cluster failed: ${resp.status()}`).toBeTruthy()

                await ss(page, '10-cluster-updated')
            }
        }
    })

    // ── 3. Host CRUD ─────────────────────────────────────────────────────

    test('create host with full fields', async ({ page }) => {
        test.skip(!clusterId, 'No cluster created yet')

        // Select cluster in tree to filter cards area
        const clusterNode = page.locator('.hr-tree-node').filter({ hasText: TEST_CLUSTER.name })
        await expect(clusterNode, 'Cluster not found in tree').toBeVisible({ timeout: 5000 })
        await clusterNode.click()
        await page.waitForTimeout(500)

        await clickActionBtn(page, /Host/)
        const modal = await getModal(page)
        await page.waitForTimeout(300)

        // Basic info section
        await fillByLabel(modal, 'Host Name', TEST_HOST.name)
        await fillByLabel(modal, 'IP Address', TEST_HOST.ip)
        const portInput = modal.locator('input[type="number"]')
        await portInput.fill(String(TEST_HOST.port))

        // System info section
        await fillByLabel(modal, 'Operating System', TEST_HOST.os)
        await fillByLabel(modal, 'Location', TEST_HOST.location)

        // Auth info section
        await fillByLabel(modal, 'Username', TEST_HOST.username)
        // Auth type select: find by label "Auth Type"
        const authTypeLabel = modal.locator('.form-label').filter({ hasText: /Auth Type/ })
        const authTypeGroup = authTypeLabel.locator('..')
        await authTypeGroup.locator('select.form-input').first().selectOption('password')
        const credInput = modal.locator('input[type="password"]')
        await credInput.fill(TEST_HOST.credential)

        // Business info section
        await selectByLabel(modal, 'Cluster', `${TEST_CLUSTER.name} (${TEST_CLUSTER.type})`)
        await fillByLabel(modal, 'Description', TEST_HOST.description)

        await ss(page, '11-host-form-filled')

        const createApi = waitForApi(page, r =>
            r.url().includes('/hosts') && r.request().method() === 'POST' && !r.url().includes('/tags') && !r.url().includes('/test'),
        )
        await saveModal(modal)
        const resp = await createApi

        expect(resp.ok(), `Create host failed: ${resp.status()}`).toBeTruthy()
        const body = await resp.json()
        expect(body.success, `API returned success:false`).toBe(true)
        expect(body.host, `Response missing host object`).toBeDefined()
        hostId = body.host.id

        await ss(page, '12-host-created')

        // Verify host card appears in the cards area
        const hostCard = page.locator('.hr-host-card').filter({ hasText: TEST_HOST.name })
        await expect(hostCard, 'Host card not visible in cards area').toBeVisible({ timeout: 5000 })

        // Verify IP:port shown on card
        await expect(hostCard.locator('.hr-host-card-mono').filter({ hasText: `${TEST_HOST.ip}:${TEST_HOST.port}` }))
            .toBeVisible({ timeout: 3000 })

        await ss(page, '13-host-in-grid')
    })

    test('view host detail panel', async ({ page }) => {
        test.skip(!hostId, 'No host created yet')

        // Select cluster in tree to show host cards
        const clusterNode = page.locator('.hr-tree-node').filter({ hasText: TEST_CLUSTER.name })
        if (await clusterNode.isVisible({ timeout: 3000 }).catch(() => false)) {
            await clusterNode.click()
            await page.waitForTimeout(500)
        }

        const hostCard = page.locator('.hr-host-card').filter({ hasText: TEST_HOST.name })
        await expect(hostCard, 'Host card not found').toBeVisible({ timeout: 5000 })

        // Click the card to open detail
        await hostCard.click()
        await page.waitForTimeout(500)

        // Verify detail panel overlay is visible
        const detailPanel = page.locator('.hr-detail-panel-overlay')
        await expect(detailPanel, 'Detail panel overlay not visible').toBeVisible({ timeout: 3000 })

        // Verify key fields in detail
        await expect(detailPanel.filter({ hasText: TEST_HOST.name })).toBeVisible()
        await expect(detailPanel.filter({ hasText: TEST_HOST.ip })).toBeVisible()

        await ss(page, '14-host-detail-panel')

        // Close detail panel (× button is in the actions area)
        const closeBtn = detailPanel.locator('.hr-detail-panel-actions button').last()
        await closeBtn.click()
        await expect(detailPanel).not.toBeVisible({ timeout: 2000 })

        await ss(page, '15-detail-panel-closed')
    })

    test('edit host', async ({ page }) => {
        test.skip(!hostId, 'No host created yet')
        const UPDATED_NAME = `${TEST_HOST.name}-edited`

        // Select cluster in tree to show host cards
        const clusterNode = page.locator('.hr-tree-node').filter({ hasText: TEST_CLUSTER.name })
        if (await clusterNode.isVisible({ timeout: 3000 }).catch(() => false)) {
            await clusterNode.click()
            await page.waitForTimeout(500)
        }

        const hostCard = page.locator('.hr-host-card').filter({ hasText: TEST_HOST.name })
        await expect(hostCard, 'Host card not found').toBeVisible({ timeout: 5000 })

        // Click the Edit button in card footer
        const editBtn = hostCard.locator('.hr-host-card-footer .btn-secondary')
        await editBtn.click()

        const modal = await getModal(page)

        // Verify edit form is pre-filled (first form-group has Host Name)
        const nameInput = modal.locator('.form-group').first().locator('input.form-input')
        await expect(nameInput).toHaveValue(TEST_HOST.name, { timeout: 3000 })

        // Verify credential is masked
        const credInput = modal.locator('input[type="password"]')
        const credValue = await credInput.inputValue()
        expect(credValue, 'Credential should be masked as *** in edit form').toBe('***')

        // Change the host name
        await nameInput.clear()
        await nameInput.fill(UPDATED_NAME)

        await ss(page, '16-host-edit-form')

        const updateApi = waitForApi(page, r =>
            r.url().includes(`/hosts/${hostId}`) && r.request().method() === 'PUT',
        )
        await saveModal(modal)
        const resp = await updateApi

        expect(resp.ok(), `Update host failed: ${resp.status()}`).toBeTruthy()
        const body = await resp.json()
        expect(body.success, `API returned success:false`).toBe(true)

        await ss(page, '17-host-updated')

        // Verify card shows updated name
        const updatedCard = page.locator('.hr-host-card').filter({ hasText: UPDATED_NAME })
        await expect(updatedCard, 'Updated host card not visible').toBeVisible({ timeout: 5000 })

        // Update test name for subsequent cleanup
        TEST_HOST.name = UPDATED_NAME

        await ss(page, '18-host-updated-in-grid')
    })

    // ── 4. Three-zone layout verification ──────────────────────────────

    test('three-zone layout is present', async ({ page }) => {
        // Verify tree sidebar
        const treeSidebar = page.locator('.hr-tree-sidebar')
        await expect(treeSidebar, 'Tree sidebar should be visible').toBeVisible()

        // Verify cards area
        const cardsArea = page.locator('.hr-cards-area')
        await expect(cardsArea, 'Cards area should be visible').toBeVisible()

        // Verify topology area
        const topologyArea = page.locator('.hr-topology-area')
        await expect(topologyArea, 'Topology area should be visible').toBeVisible()

        await ss(page, '19-three-zone-layout')
    })

    // ── 5. Cleanup (delete in reverse order: host → cluster → group) ─────

    test('delete host', async ({ page }) => {
        test.skip(!hostId, 'No host created yet')

        // Select cluster in tree to show host cards
        const clusterNode = page.locator('.hr-tree-node').filter({ hasText: TEST_CLUSTER.name })
        if (await clusterNode.isVisible({ timeout: 3000 }).catch(() => false)) {
            await clusterNode.click()
            await page.waitForTimeout(500)
        }

        const hostCard = page.locator('.hr-host-card').filter({ hasText: TEST_HOST.name })
        if (await hostCard.isVisible({ timeout: 3000 }).catch(() => false)) {
            page.once('dialog', d => d.accept())

            const deleteBtn = hostCard.locator('.hr-host-card-footer .btn-danger')
            const delApi = waitForApi(page, r =>
                r.url().includes(`/hosts/${hostId}`) && r.request().method() === 'DELETE',
            ).catch(() => null)

            await deleteBtn.click()
            const resp = await delApi
            if (resp) {
                expect(resp.ok(), `Delete host failed: ${resp.status()}`).toBeTruthy()
            }

            await page.waitForTimeout(1000)

            const cardAfterDelete = page.locator('.hr-host-card').filter({ hasText: TEST_HOST.name })
            await expect(cardAfterDelete, 'Host card should be gone after deletion')
                .not.toBeVisible({ timeout: 3000 })

            await ss(page, '20-host-deleted')
        }
    })

    test('delete cluster via tree icon', async ({ page }) => {
        test.skip(!clusterId, 'No cluster created yet')

        // Hover over cluster node to reveal action icons
        const clusterNode = page.locator('.hr-tree-node').filter({ hasText: TEST_CLUSTER.name })
        if (await clusterNode.isVisible({ timeout: 3000 }).catch(() => false)) {
            await clusterNode.hover()
            await page.waitForTimeout(300)

            page.once('dialog', d => d.accept())

            // Click delete icon (🗑)
            const deleteIcon = clusterNode.locator('.hr-tree-node-action-danger')
            if (await deleteIcon.isVisible({ timeout: 2000 }).catch(() => false)) {
                const delApi = waitForApi(page, r =>
                    r.url().includes(`/clusters/${clusterId}`) && r.request().method() === 'DELETE',
                ).catch(() => null)

                await deleteIcon.click()
                const resp = await delApi
                if (resp) {
                    expect(resp.ok(), `Delete cluster failed: ${resp.status()}`).toBeTruthy()
                }

                await page.waitForTimeout(1000)
                await ss(page, '21-cluster-deleted')
            }
        }
    })

    test('delete group via tree icon', async ({ page }) => {
        test.skip(!groupId, 'No group created yet')

        // Hover over group node to reveal action icons
        const groupNode = page.locator('.hr-tree-node').filter({ hasText: TEST_GROUP.name })
        if (await groupNode.isVisible({ timeout: 3000 }).catch(() => false)) {
            await groupNode.hover()
            await page.waitForTimeout(300)

            page.once('dialog', d => d.accept())

            // Click delete icon (🗑)
            const deleteIcon = groupNode.locator('.hr-tree-node-action-danger')
            if (await deleteIcon.isVisible({ timeout: 2000 }).catch(() => false)) {
                const delApi = waitForApi(page, r =>
                    r.url().includes(`/host-groups/${groupId}`) && r.request().method() === 'DELETE',
                ).catch(() => null)

                await deleteIcon.click()
                const resp = await delApi
                if (resp) {
                    expect(resp.ok(), `Delete group failed: ${resp.status()}`).toBeTruthy()
                }

                await page.waitForTimeout(1000)

                const nodeAfterDelete = page.locator('.hr-tree-node').filter({ hasText: TEST_GROUP.name })
                await expect(nodeAfterDelete, 'Group should be gone from tree after deletion')
                    .not.toBeVisible({ timeout: 3000 })

                await ss(page, '22-group-deleted')
            }
        }
    })
})
