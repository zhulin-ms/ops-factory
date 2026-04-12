/**
 * E2E Test: Whitelist Command CRUD
 *
 * Covers full Create / Read / Update / Delete lifecycle on the
 * SOP Workflow → Whitelist tab:
 *   1. Create  — add a new command via modal
 *   2. Read    — verify the command appears in the table
 *   3. Update  — edit description, toggle enabled state, verify changes
 *   4. Delete  — delete the command, verify it is removed
 *
 * Every step takes a screenshot and validates API responses.
 */
import { test, expect, type Page, type Response } from '@playwright/test'

const SS_DIR = 'test-results/whitelist-crud'
const TS = Date.now()
const TEST_PATTERN = `e2e-crud-cmd-${TS}`
const TEST_DESC = `E2E CRUD test command ${TS}`
const UPDATED_DESC = `Updated description ${TS}`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function ss(page: Page, name: string) {
    await page.screenshot({ path: `${SS_DIR}/${name}.png`, fullPage: true })
}

async function clickTab(page: Page, labelPattern: string) {
    const tab = page.locator('.config-tab').filter({ hasText: new RegExp(labelPattern) })
    await expect(tab).toBeVisible({ timeout: 5000 })
    await tab.click()
    await page.waitForTimeout(600)
}

async function waitForApi(
    page: Page,
    predicate: (r: Response) => boolean,
    timeout = 10000,
): Promise<Response> {
    return page.waitForResponse(predicate, { timeout })
}

/** Find a table row that contains the given text */
function findRow(page: Page, text: string) {
    return page.locator('.sop-workflow-table tbody tr').filter({ hasText: text }).first()
}

/** Count table rows containing the given text */
async function countRowsWithText(page: Page, text: string): Promise<number> {
    const rows = page.locator('.sop-workflow-table tbody tr')
    const count = await rows.count()
    let matched = 0
    for (let i = 0; i < count; i++) {
        const rowText = await rows.nth(i).textContent()
        if (rowText?.includes(text)) matched++
    }
    return matched
}

/** Open the add-command modal */
async function openAddModal(page: Page) {
    await page.locator('.sop-workflow-toolbar-actions .btn-primary').click()
    const modal = page.locator('.modal')
    await expect(modal).toBeVisible({ timeout: 5000 })
    return modal
}

/** Fill the add/edit modal form and save */
async function fillModalAndSave(
    modal: ReturnType<Page['locator']>,
    page: Page,
    opts: { pattern?: string; description?: string; enabled?: boolean } = {},
) {
    if (opts.pattern !== undefined) {
        await modal.locator('.form-input[type="text"]').fill(opts.pattern)
    }
    if (opts.description !== undefined) {
        await modal.locator('textarea').fill(opts.description)
    }
    if (opts.enabled !== undefined) {
        // The modal has a toggle-slider; click it to toggle the enabled state
        const slider = modal.locator('.toggle-slider')
        const isChecked = await slider.evaluate(
            el => getComputedStyle(el).backgroundColor !== '',
        )
        // Just click the slider to toggle — we verify the result in the table
        await slider.click()
    }

    return modal.locator('.modal-footer .btn-primary').click()
}

/** Accept the window.confirm dialog and wait for delete API */
async function confirmDelete(page: Page, row: ReturnType<Page['locator']>) {
    const delApi = waitForApi(
        page,
        r => r.url().includes('/command-whitelist/') && r.request().method() === 'DELETE',
    )
    page.once('dialog', d => d.accept())
    await row.locator('.knowledge-doc-action-btn.danger').click()
    return delApi
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe('Whitelist Command — CRUD', () => {
    test.setTimeout(120_000)

    test.beforeEach(async ({ page }) => {
        await page.goto('/#/sop-workflow')
        await page.waitForTimeout(1500)
        await clickTab(page, '命令白名单|Whitelist')
        await page.waitForTimeout(1000)
    })

    test('create, read, update, delete a whitelist command', async ({ page }) => {
        // =============================================================
        // CREATE — add a new command
        // =============================================================
        const modal = await openAddModal(page)
        await ss(page, '01-add-modal-open')

        await modal.locator('.form-input[type="text"]').fill(TEST_PATTERN)
        await modal.locator('textarea').fill(TEST_DESC)

        await ss(page, '02-add-form-filled')

        const addApi = waitForApi(
            page,
            r =>
                r.url().includes('/command-whitelist') &&
                r.request().method() === 'POST' &&
                !r.url().includes('/command-whitelist/'),
        )
        await modal.locator('.modal-footer .btn-primary').click()
        const addResp = await addApi

        expect(addResp.ok(), `Add command failed: ${addResp.status()}`).toBeTruthy()
        await expect(page.locator('.modal')).not.toBeVisible({ timeout: 3000 })

        await ss(page, '03-after-add')

        // =============================================================
        // READ — verify the command appears in the table
        // =============================================================
        const row = findRow(page, TEST_PATTERN)
        await expect(row).toBeVisible({ timeout: 5000 })
        await expect(row.locator('.sop-workflow-code-pill')).toContainText(TEST_PATTERN)
        await expect(row).toContainText(TEST_DESC)

        // Verify toggle shows enabled (default)
        const toggle = row.locator('.sop-workflow-switch')
        await expect(toggle).toBeVisible()
        await expect(toggle).toHaveAttribute('aria-checked', 'true')

        await ss(page, '04-read-verify-row')

        // =============================================================
        // UPDATE — edit description
        // =============================================================
        await row.locator('.btn-subtle').click()
        const editModal = page.locator('.modal')
        await expect(editModal).toBeVisible({ timeout: 5000 })

        // Verify modal pre-fills the pattern (read-only or editable)
        const patternInput = editModal.locator('.form-input[type="text"]')
        await expect(patternInput).toHaveValue(TEST_PATTERN)

        // Clear and update description
        await editModal.locator('textarea').clear()
        await editModal.locator('textarea').fill(UPDATED_DESC)

        await ss(page, '05-edit-form-filled')

        const updateApi = waitForApi(
            page,
            r =>
                r.url().includes('/command-whitelist/') &&
                r.request().method() === 'PUT',
        )
        await editModal.locator('.modal-footer .btn-primary').click()
        const updateResp = await updateApi

        expect(updateResp.ok(), `Update command failed: ${updateResp.status()}`).toBeTruthy()
        await expect(page.locator('.modal')).not.toBeVisible({ timeout: 3000 })

        // Verify updated description in table
        await page.waitForTimeout(800)
        const updatedRow = findRow(page, TEST_PATTERN)
        await expect(updatedRow).toBeVisible({ timeout: 5000 })
        await expect(updatedRow).toContainText(UPDATED_DESC)

        await ss(page, '06-after-edit')

        // =============================================================
        // UPDATE — toggle enabled state (disable)
        // =============================================================
        const toggleApi = waitForApi(
            page,
            r =>
                r.url().includes('/command-whitelist/') &&
                r.request().method() === 'PUT',
        )
        await toggle.click()
        const toggleResp = await toggleApi

        expect(toggleResp.ok(), `Toggle enabled failed: ${toggleResp.status()}`).toBeTruthy()
        await page.waitForTimeout(800)

        // Verify toggle changed to disabled
        const toggleAfter = findRow(page, TEST_PATTERN).locator('.sop-workflow-switch')
        await expect(toggleAfter).toHaveAttribute('aria-checked', 'false')

        await ss(page, '07-after-toggle-disable')

        // Toggle back to enabled
        const toggleBackApi = waitForApi(
            page,
            r =>
                r.url().includes('/command-whitelist/') &&
                r.request().method() === 'PUT',
        )
        await toggleAfter.click()
        const toggleBackResp = await toggleBackApi

        expect(toggleBackResp.ok(), `Toggle back failed: ${toggleBackResp.status()}`).toBeTruthy()
        await page.waitForTimeout(800)

        const toggleFinal = findRow(page, TEST_PATTERN).locator('.sop-workflow-switch')
        await expect(toggleFinal).toHaveAttribute('aria-checked', 'true')

        await ss(page, '08-after-toggle-enable')

        // =============================================================
        // DELETE — remove the command
        // =============================================================
        const delResp = await confirmDelete(page, findRow(page, TEST_PATTERN))

        expect(delResp.ok(), `Delete command failed: ${delResp.status()}`).toBeTruthy()
        await page.waitForTimeout(1000)

        // Verify row is gone
        const remainingCount = await countRowsWithText(page, TEST_PATTERN)
        expect(remainingCount, `Expected 0 rows after delete, found ${remainingCount}`).toBe(0)

        await ss(page, '09-after-delete')
    })
})
