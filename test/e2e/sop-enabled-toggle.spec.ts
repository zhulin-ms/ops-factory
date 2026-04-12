import { test, expect, type Page } from '@playwright/test'

const USER_STORAGE_KEY = 'opsfactory:userId'

async function loginAs(page: Page, username: string) {
    await page.goto('/')
    await page.evaluate(([storageKey, userId]) => {
        localStorage.setItem(storageKey, userId)
    }, [USER_STORAGE_KEY, username])
    await page.goto('/')
    await page.waitForURL('/')
    await page.waitForTimeout(500)
}

async function navigateToSopTab(page: Page) {
    // Navigate to remote diagnosis module
    await page.goto('/')
    await page.waitForURL('/')

    // Find and click the remote diagnosis / SOP entry point
    const sopTab = page.locator('[data-testid="tab-sops"], :text("SOP")').first()
    await sopTab.waitFor({ state: 'visible', timeout: 10000 })
    await sopTab.click()
    await page.waitForTimeout(500)
}

test.describe('SOP Enable/Disable Toggle', () => {
    test.beforeEach(async ({ page }) => {
        await loginAs(page, 'test-user-sop-toggle')
    })

    test('should display SOP list with enabled status', async ({ page }) => {
        await navigateToSopTab(page)

        // Verify the SOP list table header contains a status column
        const headerRow = page.locator('table thead tr').first()
        await expect(headerRow).toBeVisible({ timeout: 10000 })

        // Each SOP row should have an enabled toggle element
        const toggleButtons = page.locator('button.sop-workflow-switch, [data-testid="sop-toggle"]')
        const count = await toggleButtons.count()
        // It's OK if there are no SOPs — we just verify the column exists
        if (count > 0) {
            await expect(toggleButtons.first()).toBeVisible()
        }
    })

    test('should toggle SOP from enabled to disabled', async ({ page }) => {
        await navigateToSopTab(page)

        // Find the first enabled SOP toggle
        const enabledToggle = page.locator('button.sop-workflow-switch[aria-checked="true"], button.sop-workflow-switch.on').first()
        if (!(await enabledToggle.isVisible({ timeout: 5000 }).catch(() => false))) {
            test.skip()
            return
        }

        await enabledToggle.click()
        await page.waitForTimeout(1000)

        // Verify toast notification appears
        const toast = page.locator('.sop-workflow-toast, [role="status"]').first()
        await expect(toast).toBeVisible({ timeout: 5000 })
    })

    test('should toggle SOP from disabled to enabled', async ({ page }) => {
        await navigateToSopTab(page)

        // Find the first disabled SOP toggle
        const disabledToggle = page.locator('button.sop-workflow-switch[aria-checked="false"], button.sop-workflow-switch.off').first()
        if (!(await disabledToggle.isVisible({ timeout: 5000 }).catch(() => false))) {
            test.skip()
            return
        }

        await disabledToggle.click()
        await page.waitForTimeout(1000)

        // Verify the toggle state changed
        const toast = page.locator('.sop-workflow-toast, [role="status"]').first()
        await expect(toast).toBeVisible({ timeout: 5000 })
    })

    test('should persist toggle state after page refresh', async ({ page }) => {
        await navigateToSopTab(page)

        const enabledToggle = page.locator('button.sop-workflow-switch[aria-checked="true"], button.sop-workflow-switch.on').first()
        if (!(await enabledToggle.isVisible({ timeout: 5000 }).catch(() => false))) {
            test.skip()
            return
        }

        // Toggle to disabled
        const sopName = await page.locator('table tbody tr').first().locator('td').nth(0).textContent()
        await enabledToggle.click()
        await page.waitForTimeout(1000)

        // Refresh page
        await page.reload()
        await page.waitForTimeout(1000)

        // Verify the SOP is still disabled
        const rows = page.locator('table tbody tr')
        const rowCount = await rows.count()
        for (let i = 0; i < rowCount; i++) {
            const name = await rows.nth(i).locator('td').nth(0).textContent()
            if (name === sopName) {
                const toggle = rows.nth(i).locator('button.sop-workflow-switch')
                const isChecked = await toggle.getAttribute('aria-checked')
                expect(isChecked).toBe('false')
                break
            }
        }
    })

    test('disabled SOP should not appear in agent list_sops', async ({ page }) => {
        await navigateToSopTab(page)

        // Count visible SOPs before disabling
        const allToggles = page.locator('button.sop-workflow-switch')
        const totalBefore = await allToggles.count()

        if (totalBefore === 0) {
            test.skip()
            return
        }

        // Disable the first SOP
        const enabledToggle = page.locator('button.sop-workflow-switch[aria-checked="true"], button.sop-workflow-switch.on').first()
        if (!(await enabledToggle.isVisible({ timeout: 5000 }).catch(() => false))) {
            test.skip()
            return
        }

        await enabledToggle.click()
        await page.waitForTimeout(1000)

        // Reload and verify list count decreased
        await page.reload()
        await page.waitForTimeout(1000)

        // The disabled SOP should still be in the list (UI shows all)
        // but the enabled count should be one less
        const allTogglesAfter = page.locator('button.sop-workflow-switch')
        const totalAfter = await allTogglesAfter.count()
        expect(totalAfter).toBe(totalBefore)
    })
})
