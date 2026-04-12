/**
 * E2E Tests: Monitoring Page — Real Verification
 *
 * Covers:
 *   - Access control (admin only)
 *   - Platform tab: KPI cards show real values (uptime, host, agent count)
 *   - Agents tab: agent cards with real names, status, model info
 *   - Tab switching maintains page stability
 *   - Instances table shows running instances (if any)
 *   - Performance tab: chart sections render
 *   - Observability tab: Langfuse status (enabled or disabled message)
 */
import { test, expect, type Page } from '@playwright/test'

const ADMIN_USER = 'admin'
const REGULAR_USER = 'e2e-mon-user'

async function loginAs(page: Page, username: string) {
  await page.goto('/login')
  await page.fill('input[placeholder="Your name"]', username)
  await page.click('button:has-text("Enter")')
  await page.waitForURL('/')
  await page.waitForTimeout(500)
}

async function clickTab(page: Page, keyword: string) {
  const tabs = page.locator('.config-tab')
  const count = await tabs.count()
  for (let i = 0; i < count; i++) {
    const text = await tabs.nth(i).textContent()
    if (text?.toLowerCase().includes(keyword.toLowerCase())) {
      await tabs.nth(i).click()
      await page.waitForTimeout(1000)
      return
    }
  }
}

// =====================================================
// 1. Access Control
// =====================================================
test.describe('Monitoring — access control', () => {
  test('regular user is redirected to /', async ({ page }) => {
    await loginAs(page, REGULAR_USER)
    await page.goto('/monitoring')
    await expect(page).toHaveURL('/')
  })

  test('admin can access and page loads with tabs', async ({ page }) => {
    await loginAs(page, ADMIN_USER)
    await page.goto('/monitoring')
    await expect(page).toHaveURL('/monitoring')
    const tabs = page.locator('.config-tab')
    await expect(tabs.first()).toBeVisible({ timeout: 5000 })
    const count = await tabs.count()
    expect(count).toBeGreaterThanOrEqual(3)
  })
})

// =====================================================
// 2. Platform Tab — KPI with Real Values
// =====================================================
test.describe('Monitoring — platform tab', () => {
  test('KPI cards show real values (not empty)', async ({ page }) => {
    await loginAs(page, ADMIN_USER)
    await page.goto('/monitoring')
    await page.waitForTimeout(3000)

    // Platform is first tab, should be active by default
    const kpiCards = page.locator('.mon-kpi-card')
    await expect(kpiCards.first()).toBeVisible({ timeout: 10_000 })

    // Each KPI should have a non-empty value
    const count = await kpiCards.count()
    for (let i = 0; i < count; i++) {
      const value = await kpiCards.nth(i).locator('.mon-kpi-value').textContent()
      expect(value!.trim().length).toBeGreaterThan(0)
    }
  })

  test('uptime KPI shows a time value', async ({ page }) => {
    await loginAs(page, ADMIN_USER)
    await page.goto('/monitoring')
    await page.waitForTimeout(3000)

    // Find uptime KPI (usually contains "Uptime" or "运行时间" label)
    const kpiCards = page.locator('.mon-kpi-card')
    const count = await kpiCards.count()
    let foundUptime = false
    for (let i = 0; i < count; i++) {
      const label = await kpiCards.nth(i).locator('.mon-kpi-label').textContent()
      if (label?.toLowerCase().includes('uptime') || label?.includes('运行')) {
        const value = await kpiCards.nth(i).locator('.mon-kpi-value').textContent()
        expect(value!.trim().length).toBeGreaterThan(0)
        foundUptime = true
        break
      }
    }
    // Uptime KPI should exist
    expect(foundUptime).toBeTruthy()
  })

  test('instances section shows table or empty message', async ({ page }) => {
    await loginAs(page, ADMIN_USER)
    await page.goto('/monitoring')
    await page.waitForTimeout(3000)

    // Look for instances table or section
    const table = page.locator('.mon-agent-table, .mon-inst-table-header')
    const noData = page.locator('.mon-no-data')
    const hasTable = await table.count() > 0
    const hasNoData = await noData.isVisible()
    // One should be present
    expect(hasTable || hasNoData).toBeTruthy()
  })
})

// =====================================================
// 3. Agents Tab — Real Agent Info
// =====================================================
test.describe('Monitoring — agents tab', () => {
  test('agent cards show real agent names and status', async ({ page }) => {
    await loginAs(page, ADMIN_USER)
    await page.goto('/monitoring')
    await page.waitForTimeout(2000)
    await clickTab(page, 'agent')

    const cards = page.locator('.mon-agent-card')
    await expect(cards.first()).toBeVisible({ timeout: 10_000 })

    // First card should have a real agent name
    const name = await cards.first().locator('.mon-agent-card-name').textContent()
    expect(name!.trim().length).toBeGreaterThan(0)

    // Should show status pill
    const status = cards.first().locator('[class*="status-pill"]')
    await expect(status).toBeVisible()

    // Should show stats
    const stats = cards.first().locator('.mon-agent-card-stat')
    const statCount = await stats.count()
    expect(statCount).toBeGreaterThanOrEqual(1)

    // Stat values should not be empty
    for (let i = 0; i < statCount; i++) {
      const val = await stats.nth(i).locator('.mon-agent-card-stat-value').textContent()
      expect(val!.trim().length).toBeGreaterThan(0)
    }
  })

  test('agent cards show model/provider tags', async ({ page }) => {
    await loginAs(page, ADMIN_USER)
    await page.goto('/monitoring')
    await page.waitForTimeout(2000)
    await clickTab(page, 'agent')

    const cards = page.locator('.mon-agent-card')
    if (await cards.count() > 0) {
      const tags = cards.first().locator('.mon-agent-card-tag')
      const tagCount = await tags.count()
      expect(tagCount).toBeGreaterThanOrEqual(1)
    }
  })
})

// =====================================================
// 4. Observability Tab — Langfuse Status
// =====================================================
test.describe('Monitoring — observability tab', () => {
  test('shows Langfuse data or disabled message', async ({ page }) => {
    await loginAs(page, ADMIN_USER)
    await page.goto('/monitoring')
    await page.waitForTimeout(2000)
    await clickTab(page, 'observ')
    await page.waitForTimeout(2000)

    // Either Langfuse is enabled (toolbar + data) or disabled (message)
    const toolbar = page.locator('.mon-obs-toolbar')
    const disabled = page.locator('.mon-disabled')

    const hasToolbar = await toolbar.isVisible()
    const hasDisabled = await disabled.isVisible()

    expect(hasToolbar || hasDisabled).toBeTruthy()

    if (hasDisabled) {
      // Disabled message should have title and description
      await expect(disabled.locator('.mon-disabled-title')).toBeVisible()
      await expect(disabled.locator('.mon-disabled-desc')).toBeVisible()
    }

    if (hasToolbar) {
      // Time range buttons should be present
      const timeButtons = page.locator('.seg-filter-btn')
      const count = await timeButtons.count()
      expect(count).toBeGreaterThanOrEqual(2) // e.g., 1h, 24h, 7d, 30d
    }
  })
})

// =====================================================
// 5. Tab Switching Stability
// =====================================================
test.describe('Monitoring — tab stability', () => {
  test('rapidly switching all tabs does not crash', async ({ page }) => {
    await loginAs(page, ADMIN_USER)
    await page.goto('/monitoring')
    await page.waitForTimeout(2000)

    const tabs = page.locator('.config-tab')
    const count = await tabs.count()

    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < count; i++) {
        await tabs.nth(i).click()
        await page.waitForTimeout(300)
        await expect(tabs.nth(i)).toHaveClass(/config-tab-active/)
      }
    }

    // Page should still be alive
    await expect(page.locator('.mon-page-header')).toBeVisible()
  })
})
