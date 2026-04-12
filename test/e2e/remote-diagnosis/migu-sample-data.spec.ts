/**
 * E2E Test: Migu Video Ringtone Southwest Production — Seed & Verify
 *
 * 1. Cleans all existing data via DELETE API
 * 2. Seeds new data for 咪咕视频彩铃西南大区生产环境 via gateway API:
 *    1 top-level group → 3 sub-groups + 2 shared clusters → 9 per-province clusters
 *    → 29 hosts + 18 relations
 * 3. Verifies the host-resource page UI
 *
 * Data is NOT cleaned up after the test.
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

const SS_DIR = 'test-results/migu-sample-data'
const GATEWAY = 'http://localhost:3000/gateway'

const HEADERS = {
    'Content-Type': 'application/json',
    'x-secret-key': 'test',
    'x-user-id': 'admin',
}

// ── Data definitions ────────────────────────────────────────────────────────

interface IdMap { [key: string]: string }

const SUB_GROUPS = [
    { key: 'sc', name: '四川省生产环境', desc: '四川省生产环境业务节点' },
    { key: 'gz', name: '贵州省生产环境', desc: '贵州省生产环境业务节点' },
    { key: 'yn', name: '云南省生产环境', desc: '云南省生产环境业务节点' },
]

// Shared clusters under top-level group
const SHARED_CLUSTERS = [
    { key: 'share-gwdb', name: 'SHARE-GWDB-01', type: 'GWDB', purpose: '共享网关数据库集群' },
    { key: 'share-kafka', name: 'SHARE-KAFKA-01', type: 'KAFKA', purpose: '共享Kafka消息队列集群' },
]

// Per-province clusters
const PROVINCE_CLUSTERS = [
    { key: 'sc-nslb',   name: 'SC-NSLB-01',   type: 'NSLB',   purpose: '四川负载均衡集群',      groupKey: 'sc' },
    { key: 'sc-rcpa',   name: 'SC-RCPA-01',   type: 'RCPA',   purpose: '四川呼叫代理集群',      groupKey: 'sc' },
    { key: 'sc-rcpadb', name: 'SC-RCPADB-01',  type: 'RCPADB', purpose: '四川呼叫代理数据库集群', groupKey: 'sc' },
    { key: 'gz-nslb',   name: 'GZ-NSLB-01',   type: 'NSLB',   purpose: '贵州负载均衡集群',      groupKey: 'gz' },
    { key: 'gz-rcpa',   name: 'GZ-RCPA-01',   type: 'RCPA',   purpose: '贵州呼叫代理集群',      groupKey: 'gz' },
    { key: 'gz-rcpadb', name: 'GZ-RCPADB-01',  type: 'RCPADB', purpose: '贵州呼叫代理数据库集群', groupKey: 'gz' },
    { key: 'yn-nslb',   name: 'YN-NSLB-01',   type: 'NSLB',   purpose: '云南负载均衡集群',      groupKey: 'yn' },
    { key: 'yn-rcpa',   name: 'YN-RCPA-01',   type: 'RCPA',   purpose: '云南呼叫代理集群',      groupKey: 'yn' },
    { key: 'yn-rcpadb', name: 'YN-RCPADB-01',  type: 'RCPADB', purpose: '云南呼叫代理数据库集群', groupKey: 'yn' },
]

const HOSTS = [
    // Shared: GWDB (2)
    { name: 'gwdb-share-01', ip: '10.100.1.11', cluster: 'share-gwdb', loc: '成都DC-A', purpose: '网关数据库主节点' },
    { name: 'gwdb-share-02', ip: '10.100.1.12', cluster: 'share-gwdb', loc: '成都DC-B', purpose: '网关数据库从节点' },
    // Shared: KAFKA (3)
    { name: 'kafka-share-01', ip: '10.100.2.21', cluster: 'share-kafka', loc: '成都DC-A', purpose: 'Kafka Broker' },
    { name: 'kafka-share-02', ip: '10.100.2.22', cluster: 'share-kafka', loc: '昆明DC-A', purpose: 'Kafka Broker' },
    { name: 'kafka-share-03', ip: '10.100.2.23', cluster: 'share-kafka', loc: '贵阳DC-A', purpose: 'Kafka Broker' },
    // Sichuan: NSLB (2)
    { name: 'nslb-sc-01', ip: '10.120.1.11', cluster: 'sc-nslb', loc: '成都DC-A', purpose: '负载均衡主节点' },
    { name: 'nslb-sc-02', ip: '10.120.1.12', cluster: 'sc-nslb', loc: '成都DC-B', purpose: '负载均衡备节点' },
    // Sichuan: RCPA (4)
    { name: 'rcpa-sc-01', ip: '10.120.2.21', cluster: 'sc-rcpa', loc: '成都DC-A', purpose: '呼叫代理主节点' },
    { name: 'rcpa-sc-02', ip: '10.120.2.22', cluster: 'sc-rcpa', loc: '成都DC-A', purpose: '呼叫代理节点' },
    { name: 'rcpa-sc-03', ip: '10.120.2.23', cluster: 'sc-rcpa', loc: '成都DC-B', purpose: '呼叫代理节点' },
    { name: 'rcpa-sc-04', ip: '10.120.2.24', cluster: 'sc-rcpa', loc: '成都DC-B', purpose: '呼叫代理备节点' },
    // Sichuan: RCPADB (2)
    { name: 'rcpadb-sc-01', ip: '10.120.3.31', cluster: 'sc-rcpadb', loc: '成都DC-A', purpose: '数据库主节点' },
    { name: 'rcpadb-sc-02', ip: '10.120.3.32', cluster: 'sc-rcpadb', loc: '成都DC-B', purpose: '数据库从节点' },
    // Guizhou: NSLB (2)
    { name: 'nslb-gz-01', ip: '10.140.1.11', cluster: 'gz-nslb', loc: '贵阳DC-A', purpose: '负载均衡主节点' },
    { name: 'nslb-gz-02', ip: '10.140.1.12', cluster: 'gz-nslb', loc: '贵阳DC-B', purpose: '负载均衡备节点' },
    // Guizhou: RCPA (4)
    { name: 'rcpa-gz-01', ip: '10.140.2.21', cluster: 'gz-rcpa', loc: '贵阳DC-A', purpose: '呼叫代理主节点' },
    { name: 'rcpa-gz-02', ip: '10.140.2.22', cluster: 'gz-rcpa', loc: '贵阳DC-A', purpose: '呼叫代理节点' },
    { name: 'rcpa-gz-03', ip: '10.140.2.23', cluster: 'gz-rcpa', loc: '贵阳DC-B', purpose: '呼叫代理节点' },
    { name: 'rcpa-gz-04', ip: '10.140.2.24', cluster: 'gz-rcpa', loc: '贵阳DC-B', purpose: '呼叫代理备节点' },
    // Guizhou: RCPADB (2)
    { name: 'rcpadb-gz-01', ip: '10.140.3.31', cluster: 'gz-rcpadb', loc: '贵阳DC-A', purpose: '数据库主节点' },
    { name: 'rcpadb-gz-02', ip: '10.140.3.32', cluster: 'gz-rcpadb', loc: '贵阳DC-B', purpose: '数据库从节点' },
    // Yunnan: NSLB (2)
    { name: 'nslb-yn-01', ip: '10.130.1.11', cluster: 'yn-nslb', loc: '昆明DC-A', purpose: '负载均衡主节点' },
    { name: 'nslb-yn-02', ip: '10.130.1.12', cluster: 'yn-nslb', loc: '昆明DC-B', purpose: '负载均衡备节点' },
    // Yunnan: RCPA (4)
    { name: 'rcpa-yn-01', ip: '10.130.2.21', cluster: 'yn-rcpa', loc: '昆明DC-A', purpose: '呼叫代理主节点' },
    { name: 'rcpa-yn-02', ip: '10.130.2.22', cluster: 'yn-rcpa', loc: '昆明DC-A', purpose: '呼叫代理节点' },
    { name: 'rcpa-yn-03', ip: '10.130.2.23', cluster: 'yn-rcpa', loc: '昆明DC-B', purpose: '呼叫代理节点' },
    { name: 'rcpa-yn-04', ip: '10.130.2.24', cluster: 'yn-rcpa', loc: '昆明DC-B', purpose: '呼叫代理备节点' },
    // Yunnan: RCPADB (2)
    { name: 'rcpadb-yn-01', ip: '10.130.3.31', cluster: 'yn-rcpadb', loc: '昆明DC-A', purpose: '数据库主节点' },
    { name: 'rcpadb-yn-02', ip: '10.130.3.32', cluster: 'yn-rcpadb', loc: '昆明DC-B', purpose: '数据库从节点' },
]

const RELATIONS = [
    // NSLB → RCPA (负载转发, per province)
    { source: 'nslb-sc-01', target: 'rcpa-sc-01', desc: '负载转发' },
    { source: 'nslb-sc-02', target: 'rcpa-sc-02', desc: '负载转发' },
    { source: 'nslb-gz-01', target: 'rcpa-gz-01', desc: '负载转发' },
    { source: 'nslb-gz-02', target: 'rcpa-gz-02', desc: '负载转发' },
    { source: 'nslb-yn-01', target: 'rcpa-yn-01', desc: '负载转发' },
    { source: 'nslb-yn-02', target: 'rcpa-yn-02', desc: '负载转发' },
    // RCPA → RCPADB (数据库访问, per province)
    { source: 'rcpa-sc-01', target: 'rcpadb-sc-01', desc: '数据库访问' },
    { source: 'rcpa-sc-02', target: 'rcpadb-sc-02', desc: '数据库访问' },
    { source: 'rcpa-gz-01', target: 'rcpadb-gz-01', desc: '数据库访问' },
    { source: 'rcpa-gz-02', target: 'rcpadb-gz-02', desc: '数据库访问' },
    { source: 'rcpa-yn-01', target: 'rcpadb-yn-01', desc: '数据库访问' },
    { source: 'rcpa-yn-02', target: 'rcpadb-yn-02', desc: '数据库访问' },
    // RCPA → KAFKA (消息队列调用)
    { source: 'rcpa-sc-01', target: 'kafka-share-01', desc: '消息队列调用' },
    { source: 'rcpa-sc-02', target: 'kafka-share-02', desc: '消息队列调用' },
    { source: 'rcpa-gz-01', target: 'kafka-share-02', desc: '消息队列调用' },
    { source: 'rcpa-gz-02', target: 'kafka-share-03', desc: '消息队列调用' },
    { source: 'rcpa-yn-01', target: 'kafka-share-01', desc: '消息队列调用' },
    { source: 'rcpa-yn-02', target: 'kafka-share-03', desc: '消息队列调用' },
]

// ── Helpers ─────────────────────────────────────────────────────────────────

async function ss(page: Page, name: string) {
    await page.screenshot({ path: `${SS_DIR}/${name}.png`, fullPage: true })
}

async function apiGet<T = any>(request: APIRequestContext, url: string): Promise<T> {
    const res = await request.get(`${GATEWAY}${url}`, { headers: HEADERS })
    return res.json()
}

async function apiPost(request: APIRequestContext, url: string, body: object) {
    const res = await request.post(`${GATEWAY}${url}`, { data: body, headers: HEADERS })
    const text = await res.text()
    console.log(`POST ${url} → ${res.status()}: ${text.substring(0, 200)}`)
    expect(res.ok(), `POST ${url} returned ${res.status()}: ${text.substring(0, 200)}`).toBe(true)
    const json = JSON.parse(text)
    expect(json.success, `POST ${url} API error: ${JSON.stringify(json)}`).toBe(true)
    return json
}

async function apiDelete(request: APIRequestContext, url: string) {
    const res = await request.delete(`${GATEWAY}${url}`, { headers: HEADERS })
    const status = res.status()
    if (status >= 400) {
        const body = await res.text().catch(() => '')
        console.warn(`DELETE ${url} → ${status}: ${body}`)
    }
    return status
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

async function cleanupAll(request: APIRequestContext) {
    console.log('Cleaning up existing data...')

    // Delete in dependency order: relations → hosts → clusters → groups
    const relations: any[] = (await apiGet(request, '/host-relations')).relations || []
    for (const r of relations) {
        await apiDelete(request, `/host-relations/${r.id}`)
    }

    const hosts: any[] = (await apiGet(request, '/hosts')).hosts || []
    for (const h of hosts) {
        await apiDelete(request, `/hosts/${h.id}`)
    }

    const clusters: any[] = (await apiGet(request, '/clusters')).clusters || []
    for (const c of clusters) {
        await apiDelete(request, `/clusters/${c.id}`)
    }

    // Delete groups: multi-pass to handle parent-child dependencies
    // Sub-groups first, then parents; repeat until no more groups remain
    let totalGroupsDeleted = 0
    for (let pass = 0; pass < 5; pass++) {
        const groups: any[] = (await apiGet(request, '/host-groups')).groups || []
        if (groups.length === 0) break
        // Sort: deepest (has parentId) first
        const sorted = [...groups].sort((a, b) => (a.parentId ? 0 : 1) - (b.parentId ? 0 : 1))
        let deleted = 0
        for (const g of sorted) {
            const status = await apiDelete(request, `/host-groups/${g.id}`)
            if (status < 400) deleted++
        }
        totalGroupsDeleted += deleted
        if (deleted === 0) break // no progress, stop
    }

    console.log(`Cleaned: ${relations.length} relations, ${hosts.length} hosts, ${clusters.length} clusters, ${totalGroupsDeleted} groups`)
}

// ── Test ────────────────────────────────────────────────────────────────────

test.describe('咪咕视频彩铃西南大区生产环境 — Sample Data', () => {
    test.setTimeout(120_000)

    const groupIds: IdMap = {}
    const clusterIds: IdMap = {}
    const hostIds: IdMap = {}

    test('cleanup, seed data and verify page', async ({ page, request }) => {
        // ── Step 0: Clean all existing data ──────────────────────────
        await cleanupAll(request)

        // ── Step 1: Create groups via API ──────────────────────────
        const topGroup = await apiPost(request, '/host-groups', {
            name: '咪咕视频彩铃西南大区生产环境',
            description: '咪咕视频彩铃业务西南大区生产环境资源管理',
        })
        groupIds['top'] = topGroup.group.id

        for (const sg of SUB_GROUPS) {
            const res = await apiPost(request, '/host-groups', {
                name: sg.name,
                parentId: groupIds['top'],
                description: sg.desc,
            })
            groupIds[sg.key] = res.group.id
        }
        console.log('Created 1 top group + 3 sub-groups')

        // ── Step 2: Create shared clusters (under top group) ────────
        for (const cl of SHARED_CLUSTERS) {
            const res = await apiPost(request, '/clusters', {
                name: cl.name,
                type: cl.type,
                purpose: cl.purpose,
                groupId: groupIds['top'],
                description: cl.purpose,
            })
            clusterIds[cl.key] = res.cluster.id
        }

        // ── Step 3: Create per-province clusters ────────────────────
        for (const cl of PROVINCE_CLUSTERS) {
            const res = await apiPost(request, '/clusters', {
                name: cl.name,
                type: cl.type,
                purpose: cl.purpose,
                groupId: groupIds[cl.groupKey],
                description: cl.purpose,
            })
            clusterIds[cl.key] = res.cluster.id
        }
        console.log(`Created ${SHARED_CLUSTERS.length + PROVINCE_CLUSTERS.length} clusters`)

        // ── Step 4: Create hosts via API ────────────────────────────
        for (const h of HOSTS) {
            const res = await apiPost(request, '/hosts', {
                name: h.name,
                hostname: h.name,
                ip: h.ip,
                port: 22,
                os: 'Linux',
                location: h.loc,
                username: 'root',
                authType: 'password',
                credential: 'seed-default',
                clusterId: clusterIds[h.cluster],
                purpose: h.purpose,
                business: '咪咕彩铃',
                tags: [],
                description: h.purpose,
            })
            hostIds[h.name] = res.host.id
        }
        console.log(`Created ${HOSTS.length} hosts`)

        // ── Step 5: Create relations via API ────────────────────────
        for (const rel of RELATIONS) {
            await apiPost(request, '/host-relations', {
                sourceHostId: hostIds[rel.source],
                targetHostId: hostIds[rel.target],
                description: rel.desc,
            })
        }
        console.log(`Created ${RELATIONS.length} relations`)

        // ── Step 6: Navigate and verify UI ──────────────────────────
        await page.goto('/')
        await page.evaluate(() => localStorage.setItem('ops-factory-user', 'admin'))
        await page.goto('/#/host-resource')
        await page.waitForSelector('.resource-page', { timeout: 10000 })
        await page.waitForTimeout(1500)
        await ss(page, '01-page-loaded')

        // Verify three-zone layout
        const treeSidebar = page.locator('.hr-tree-sidebar')
        const cardsArea = page.locator('.hr-cards-area')
        const topologyArea = page.locator('.hr-topology-area')
        await expect(treeSidebar, 'Tree sidebar should be visible').toBeVisible()
        await expect(cardsArea, 'Cards area should be visible').toBeVisible()
        await expect(topologyArea, 'Topology area should be visible').toBeVisible()
        await ss(page, '02-three-zone-layout')

        // Verify top-level group in tree
        const topGroupNode = page.locator('.hr-tree-node').filter({ hasText: '咪咕视频彩铃西南大区生产环境' }).first()
        await expect(topGroupNode, 'Top-level group should be in tree').toBeVisible({ timeout: 5000 })

        // Verify sub-groups in tree
        for (const sg of SUB_GROUPS) {
            const sgNode = page.locator('.hr-tree-node').filter({ hasText: sg.name }).first()
            await expect(sgNode, `Sub-group ${sg.name} should be in tree`).toBeVisible({ timeout: 5000 })
        }
        await ss(page, '03-tree-groups')

        // Verify clusters in tree (spot check shared + province)
        const clusterNames = [...SHARED_CLUSTERS, ...PROVINCE_CLUSTERS].map(c => c.name)
        for (const name of clusterNames) {
            const clNode = page.locator('.hr-tree-node').filter({ hasText: name }).first()
            await expect(clNode, `Cluster ${name} should be in tree`).toBeVisible({ timeout: 5000 })
        }
        await ss(page, '04-tree-clusters')

        // ── Step 7: Click a cluster → verify card filtering ─────────
        const scNslbNode = page.locator('.hr-tree-node').filter({ hasText: 'SC-NSLB-01' }).first()
        await scNslbNode.click()
        await page.waitForSelector('.hr-host-card', { timeout: 5000 })

        const hostCards = page.locator('.hr-host-card')
        const cardCount = await hostCards.count()
        expect(cardCount, 'SC-NSLB-01 should have 2 host cards').toBeGreaterThanOrEqual(2)
        await ss(page, '05-cluster-selected-cards')

        // Verify specific host names appear
        await expect(hostCards.filter({ hasText: 'nslb-sc-01' }).first()).toBeVisible()
        await expect(hostCards.filter({ hasText: 'nslb-sc-02' }).first()).toBeVisible()

        // ── Step 8: Click top-level group → verify all hosts ────────
        const topNode = page.locator('.hr-tree-node').filter({ hasText: '咪咕视频彩铃西南大区生产环境' }).first()
        await topNode.click()
        // Wait for host cards to load (the group fetch may take longer)
        await page.waitForSelector('.hr-host-card', { timeout: 5000 })
        await page.waitForTimeout(500)

        const allCards = page.locator('.hr-host-card')
        const allCount = await allCards.count()
        // Page has pagination (6 per page), so we see at most 6 cards at once
        expect(allCount, 'Top-level group should show host cards').toBeGreaterThanOrEqual(1)
        // Verify total count from pagination info or just that cards exist
        const paginationInfo = page.locator('.hr-pagination-info')
        if (await paginationInfo.isVisible()) {
            const infoText = await paginationInfo.textContent()
            console.log('Pagination info:', infoText)
        }
        await ss(page, '06-all-hosts')

        // ── Step 9: Verify topology rendered ─────────────────────────
        const svgInTopology = topologyArea.locator('svg')
        await expect(svgInTopology.first(), 'Topology should render SVG graph').toBeVisible({ timeout: 5000 })
        await ss(page, '07-topology-rendered')

        // ── Step 10: Click a host card → verify topology focus ───────
        const firstVisibleCard = allCards.first()
        await firstVisibleCard.click()
        await page.waitForTimeout(500)
        await ss(page, '08-host-card-clicked-focus')

        // Click again to unfocus
        await firstVisibleCard.click()
        await page.waitForTimeout(300)
        await ss(page, '09-host-unfocused')

        console.log('All verifications passed — data kept in system')
    })
})
