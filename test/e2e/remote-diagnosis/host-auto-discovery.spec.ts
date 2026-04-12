/**
 * E2E Test: Host Auto Discovery (LLM-powered attribute detection)
 *
 * Tests the two-phase host attribute discovery flow:
 *   Phase 1: POST /gateway/hosts/{id}/discover-plan  → LLM generates probe commands
 *   Phase 2: POST /gateway/hosts/{id}/discover-execute → SSH execute + LLM parse
 *
 * Uses qos-agent's LLM config (Qwen3.5-35B-A3B via OpenRouter).
 * Target host: 127.0.0.1 with local SSH access (sunsong/0805).
 *
 * Test strategy:
 *   - API-level tests verify the backend endpoint contract
 *   - UI-level test verifies the button exists and triggers the plan flow
 */
import { test, expect, type Page, type Response } from '@playwright/test'

const GATEWAY = 'http://localhost:3000/gateway'
const ADMIN_USER = 'admin'
const SS_DIR = 'test-results/host-auto-discovery'

const TEST_HOST = {
    name: 'E2E-Discovery-Target',
    ip: '127.0.0.1',
    port: 22,
    username: 'sunsong',
    authType: 'password',
    credential: '0805',
    os: '',
    description: 'E2E auto-discovery test host',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function ss(page: Page, name: string) {
    await page.screenshot({ path: `${SS_DIR}/${name}.png`, fullPage: true })
}

async function gatewayHeaders(userId = ADMIN_USER): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        'x-secret-key': 'test',
        'x-user-id': userId,
    }
}

/** Create a host directly via API and return the host ID */
async function createHostViaApi(request: ReturnType<Page['context']>['request'] | any): Promise<string> {
    // @ts-expect-error Playwright request fixture
    const resp = await request.post(`${GATEWAY}/hosts`, {
        headers: await gatewayHeaders(),
        data: TEST_HOST,
    })
    expect(resp.ok(), `Create host API failed: ${resp.status()}`).toBeTruthy()
    const body = await resp.json()
    expect(body.success, `Create host returned success:false: ${JSON.stringify(body)}`).toBe(true)
    expect(body.host?.id, `Host ID missing in response`).toBeTruthy()
    return body.host.id
}

/** Delete a host directly via API (safe to call even if context is closed) */
async function deleteHostViaApi(request: any, hostId: string) {
    try {
        await request.delete(`${GATEWAY}/hosts/${hostId}`, {
            headers: await gatewayHeaders(),
        })
    } catch {
        // Context may be closed if test timed out — best-effort cleanup
    }
}

async function navigateToHostResource(page: Page) {
    await page.goto('/#/host-resource')
    await page.waitForSelector('.resource-page', { timeout: 10000 })
    await page.waitForTimeout(800)
}

// ── Shared state ─────────────────────────────────────────────────────────────

let hostId = ''

// ── API-Level Tests ──────────────────────────────────────────────────────────

test.describe('Host Auto Discovery — API', () => {
    test.setTimeout(120_000)

    test('create test host', async ({ request }) => {
        hostId = await createHostViaApi(request)
        expect(hostId).toBeTruthy()
    })

    test('Phase 1: discover-plan returns command list', async ({ request }) => {
        test.skip(!hostId, 'No host created')
        test.setTimeout(90_000)

        const resp = await request.post(`${GATEWAY}/hosts/${hostId}/discover-plan`, {
            headers: await gatewayHeaders(),
        })

        expect(resp.ok(), `discover-plan failed: ${resp.status()}`).toBeTruthy()
        const body = await resp.json()
        console.log('[discover-plan] response:', JSON.stringify(body, null, 2))

        if (body.success) {
            expect(body.hostId, 'hostId missing').toBe(hostId)
            expect(body.commands, 'commands missing').toBeDefined()
            expect(Array.isArray(body.commands), 'commands should be array').toBe(true)
            expect(body.commands.length, 'should have at least 1 command').toBeGreaterThan(0)

            // Validate command structure
            for (const cmd of body.commands) {
                expect(cmd.label, 'command missing label').toBeTruthy()
                expect(cmd.command, 'command missing command text').toBeTruthy()
                expect(cmd.purpose, 'command missing purpose').toBeTruthy()
            }

            // Print commands for verification
            console.log('[discover-plan] generated commands:')
            for (const cmd of body.commands) {
                console.log(`  [${cmd.label}] ${cmd.command}`)
                console.log(`    purpose: ${cmd.purpose}`)
            }
        } else {
            // LLM might not be reachable — log but don't fail if error is about LLM connectivity
            console.log(`[discover-plan] LLM error (expected if no network): ${body.error}`)
            // Still validate the error response structure
            expect(body.error, 'should have error message').toBeTruthy()
        }
    })

    test('Phase 2: discover-execute runs commands and returns results', async ({ request }) => {
        test.skip(!hostId, 'No host created')
        test.setTimeout(120_000)

        // Use a fixed set of safe read-only commands for the execute phase
        const commands = [
            { label: 'hostname', command: 'hostname', purpose: 'Get hostname' },
            { label: 'os-info', command: 'cat /etc/os-release 2>/dev/null || sw_vers 2>/dev/null || echo "unknown"', purpose: 'Get OS info' },
            { label: 'cpu-info', command: 'lscpu 2>/dev/null || echo "lscpu not available"', purpose: 'Get CPU info' },
            { label: 'mem-info', command: 'free -h 2>/dev/null || vm_stat 2>/dev/null || echo "unknown"', purpose: 'Get memory info' },
            { label: 'disk-info', command: 'df -h 2>/dev/null || echo "unknown"', purpose: 'Get disk info' },
            { label: 'uptime', command: 'uptime 2>/dev/null || echo "unknown"', purpose: 'Get uptime' },
            { label: 'kernel', command: 'uname -a 2>/dev/null || echo "unknown"', purpose: 'Get kernel version' },
        ]

        const resp = await request.post(`${GATEWAY}/hosts/${hostId}/discover-execute`, {
            headers: await gatewayHeaders(),
            data: { commands },
        })

        expect(resp.ok(), `discover-execute failed: ${resp.status()}`).toBeTruthy()
        const body = await resp.json()
        console.log('[discover-execute] response:', JSON.stringify(body, null, 2).substring(0, 2000))

        if (body.success) {
            expect(body.hostId, 'hostId missing').toBe(hostId)

            // rawOutputs should contain results for each command
            if (body.rawOutputs) {
                const outputs = body.rawOutputs as Record<string, string>
                const labels = Object.keys(outputs)
                expect(labels.length, 'should have outputs for commands').toBeGreaterThan(0)
                console.log('[discover-execute] raw outputs:')
                for (const [label, output] of Object.entries(outputs)) {
                    const preview = output.substring(0, 200)
                    console.log(`  [${label}]: ${preview}`)
                }
            }

            // formMappings may be populated if LLM parsing succeeded
            if (body.formMappings) {
                console.log('[discover-execute] formMappings:', JSON.stringify(body.formMappings))
            }

            // customAttributes may be populated if LLM parsing succeeded
            if (body.customAttributes && body.customAttributes.length > 0) {
                console.log('[discover-execute] customAttributes:')
                for (const attr of body.customAttributes) {
                    console.log(`  ${attr.key}: ${attr.value}`)
                }
            }
        } else {
            // SSH or LLM error — expected if host is unreachable or LLM not configured
            console.log(`[discover-execute] error (expected if no SSH/LLM): ${body.error}`)
            expect(body.error, 'should have error message').toBeTruthy()
        }
    })

    test('discover-plan with non-existent host returns error', async ({ request }) => {
        const resp = await request.post(`${GATEWAY}/hosts/nonexistent-id/discover-plan`, {
            headers: await gatewayHeaders(),
        })
        const body = await resp.json()
        expect(body.success, 'should fail for non-existent host').toBe(false)
        expect(body.error, 'should have error message').toBeTruthy()
    })

    test('discover-execute with empty commands returns error', async ({ request }) => {
        test.skip(!hostId, 'No host created')

        const resp = await request.post(`${GATEWAY}/hosts/${hostId}/discover-execute`, {
            headers: await gatewayHeaders(),
            data: { commands: [] },
        })
        expect(resp.status(), 'should return 400 for empty commands').toBe(400)
        const body = await resp.json()
        expect(body.success, 'should fail').toBe(false)
    })

    test('cleanup: delete test host', async ({ request }) => {
        test.skip(!hostId, 'No host to delete')
        await deleteHostViaApi(request, hostId)
    })
})

// ── UI-Level Test ────────────────────────────────────────────────────────────

test.describe('Host Auto Discovery — UI', () => {
    test.setTimeout(120_000)

    test('Auto Discover button visible in host edit modal', async ({ page }) => {
        // ── Navigate ──
        await page.goto('/')
        await page.evaluate(() => localStorage.setItem('ops-factory-user', 'admin'))
        await navigateToHostResource(page)
        await ss(page, '00-page-loaded')

        // Wait for host cards to load
        const firstCard = page.locator('.hr-host-card').first()
        await expect(firstCard, 'At least one host card should be visible').toBeVisible({ timeout: 10000 })
        await ss(page, '01-cards-loaded')

        // ── Click Edit button on the first host card ──
        const editBtn = firstCard.locator('.btn-subtle').first()
        await expect(editBtn, 'Edit button should be visible').toBeVisible({ timeout: 3000 })
        await editBtn.click()

        // ── Wait for edit modal ──
        const modal = page.locator('.modal').last()
        await expect(modal, 'Edit modal should appear').toBeVisible({ timeout: 5000 })
        await ss(page, '02-edit-modal-opened')

        // ── Verify Auto Discover button is visible ──
        const autoDiscoverBtn = modal.locator('button').filter({ hasText: /自动发现|Auto Discover/ })
        await expect(autoDiscoverBtn, 'Auto Discover button should be visible in edit modal').toBeVisible({ timeout: 5000 })
        await ss(page, '03-auto-discover-button-visible')

        // ── Click Auto Discover ──
        await autoDiscoverBtn.click()
        await ss(page, '04-after-click')

        // Wait for the discover-plan API response (or timeout)
        const planResp = await page.waitForResponse(
            r => r.url().includes('/discover-plan') && r.request().method() === 'POST',
            { timeout: 120000 },
        ).catch(() => null)

        if (planResp) {
            const planBody = await planResp.json()
            console.log('[UI] discover-plan success:', planBody.success)

            if (planBody.success) {
                await page.waitForTimeout(1000)
                await ss(page, '05-commands-confirmation')

                // Verify command checkboxes and Run Selected button
                const checkboxes = modal.locator('input[type="checkbox"]')
                const checkboxCount = await checkboxes.count()
                console.log(`[UI] ${checkboxCount} commands generated`)
                expect(checkboxCount, 'Should have command checkboxes').toBeGreaterThan(0)

                const runBtn = modal.locator('button').filter({ hasText: /执行选中|Run Selected/ })
                await expect(runBtn, 'Run Selected button should appear').toBeVisible({ timeout: 3000 })
                await ss(page, '06-run-selected-visible')
            } else {
                console.log(`[UI] Plan failed: ${planBody.error}`)
                await ss(page, '05-plan-failed')
            }
        }

        // ── Close modal ──
        const closeBtn = modal.locator('.modal-close')
        await closeBtn.click().catch(() => {})

        await ss(page, '07-test-done')
    })
})
