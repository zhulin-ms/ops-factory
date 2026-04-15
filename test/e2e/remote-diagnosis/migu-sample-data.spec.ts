/**
 * E2E Test: Migu Video Ringtone Southwest Production — Seed & Verify
 *
 * 1. Cleans all existing data via DELETE API
 * 2. Seeds new data for 咪咕视频彩铃西南大区生产环境 via gateway API:
 *    - Cluster types (NSLB, RCPA, RCPADB, GWDB, KAFKA, HAPROXY, CORE_SERVICE)
 *    - Business types (彩铃查询业务, 彩铃上报业务, 查询接口)
 *    - 1 top-level group → 4 province groups → 6 sub-groups (biz/res per province)
 *    - 2 shared clusters → 9 per-province clusters
 *    - 29 hosts + 24 relations + 6 business services (with hostIds & businessTypeId)
 *
 *    Also seeds 测试环境:
 *    - 2 clusters (HAPROXY, CORE_SERVICE) + 4 hosts + 4 relations + 1 business service (查询接口)
 *
 *    Call chain per province:
 *      用户 → NSLB(入口) → RCPA(处理) → RCPADB(数据) + KAFKA(消息)
 *
 *    Business services:
 *      - 每省2个 (查询+上报), 共6个, 均以NSLB为入口资源
 *      - 关联 businessTypeId
 *
 *    Relations (24):
 *      - NSLB → RCPA: 负载转发 (每省4条, 主备各转发2个RCPA节点)
 *      - RCPA → RCPADB: 数据库访问 (每省2条)
 *      - RCPA → KAFKA: 消息队列调用 (每省2条, 跨省共享)
 *
 * 3. Verifies the host-resource page UI with tabs
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

// Cluster type definitions
const CLUSTER_TYPE_DEFS = [
    {
        key: 'nslb',
        name: 'NSLB',
        code: 'nslb',
        description: '网络负载均衡集群，负责流量分发和负载均衡',
        color: '#10b981',
        knowledge: 'NSLB集群通常部署在核心网边缘，负责将业务请求分发到后端的RCPA节点。常用命令：nslb-cli status, nslb-cli route-list。关键配置：负载均衡策略、健康检查间隔、最大连接数。',
    },
    {
        key: 'rcpa',
        name: 'RCPA',
        code: 'rcpa',
        description: '呼叫代理集群，处理彩铃业务的核心呼叫逻辑',
        color: '#3b82f6',
        knowledge: 'RCPA集群是彩铃业务核心处理节点，负责呼叫接续、放音控制和信令处理。常用命令：rcpa-cli status, rcpa-cli session-list, rcpa-cli reload。关键配置：最大并发数、超时时间、放音资源路径。',
    },
    {
        key: 'rcpadb',
        name: 'RCPADB',
        code: 'rcpadb',
        description: '呼叫代理数据库集群，存储用户数据和业务配置',
        color: '#f59e0b',
        knowledge: 'RCPADB集群为RCPA提供数据存储服务，主要存储用户彩铃配置、订购关系和话单数据。常用命令：rcpadb-cli backup, rcpadb-cli query-users。关键配置：主从同步策略、备份频率、连接池大小。',
    },
    {
        key: 'gwdb',
        name: 'GWDB',
        code: 'gwdb',
        description: '网关数据库集群，存储网关配置和路由信息',
        color: '#8b5cf6',
        knowledge: 'GWDB集群为网关提供数据存储服务，存储路由配置、计费策略和系统参数。常用命令：gwdb-cli export-config, gwdb-cli check-sync。关键配置：数据同步模式、缓存策略。',
    },
    {
        key: 'kafka',
        name: 'KAFKA',
        code: 'kafka',
        description: 'Kafka消息队列集群，提供异步消息传输',
        color: '#ef4444',
        knowledge: 'Kafka集群承载彩铃业务的事件通知、话单传输和异步消息处理。常用命令：kafka-topics.sh --list, kafka-consumer-groups.sh --describe。关键配置：分区数、副本因子、消息保留时间。',
    },
    {
        key: 'haproxy',
        name: 'HAPROXY',
        code: 'haproxy',
        description: 'HAProxy负载均衡集群，提供HTTP/TCP流量分发',
        color: '#14b8a6',
        knowledge: 'HAProxy集群负责将业务请求分发到后端服务节点。常用命令：systemctl status haproxy, haproxy -c -f /etc/haproxy/haproxy.cfg, echo "show stat" | socat stdio /var/run/haproxy.sock。关键配置：前端绑定端口、后端服务器列表、健康检查策略、负载均衡算法。',
    },
    {
        key: 'core-service',
        name: 'CORE_SERVICE',
        code: 'core-service',
        description: '核心服务集群，提供业务查询和处理的API服务',
        color: '#a855f7',
        knowledge: '核心服务集群承载查询接口等核心业务逻辑。常用命令：systemctl status core-service, curl http://localhost:8080/actuator/health, journalctl -u core-service --since "1 hour ago"。关键配置：服务端口、数据库连接池、超时时间、日志级别。',
    },
]

// Business type definitions
const BUSINESS_TYPE_DEFS = [
    {
        key: 'colorring-query',
        name: '彩铃查询业务',
        code: 'colorring-query',
        description: '彩铃查询业务，用户查询当前彩铃设置和可用彩铃资源',
        color: '#6366f1',
        knowledge: '彩铃查询业务流程：用户发起查询请求 → NSLB负载分发 → RCPA处理查询 → RCPADB读取用户配置 → 返回彩铃列表。常见问题：查询超时（检查RCPADB连接池）、数据不一致（检查主从同步）。常用排查命令：rcpa-cli session-trace, rcpadb-cli slow-query。',
    },
    {
        key: 'colorring-upload',
        name: '彩铃上报业务',
        code: 'colorring-upload',
        description: '彩铃上报业务，用户上传和设置个性化彩铃',
        color: '#ec4899',
        knowledge: '彩铃上报业务流程：用户上传彩铃文件 → NSLB分发 → RCPA处理文件 → 写入RCPADB → 通过Kafka通知其他节点。常见问题：上传失败（检查文件大小限制）、上报延迟（检查Kafka分区负载）。常用排查命令：kafka-consumer-groups.sh --lag, rcpa-cli upload-status。',
    },
    {
        key: 'query-test',
        name: '查询接口',
        code: 'QUERY_TEST',
        description: '查询接口测试业务，验证核心服务查询功能',
        color: '#f97316',
        knowledge: '查询接口测试业务流程：客户端发起查询请求 → HAProxy负载分发 → 核心服务处理查询 → 返回结果。常见问题：查询超时（检查core-service连接池）、HAProxy后端节点不可达（检查健康检查状态）。常用排查命令：curl -o /dev/null -w "%{http_code}" http://localhost:8080/api/query, haproxy-show stat。',
    },
]

// 2nd-level province groups (under top-level group)
const PROVINCE_GROUPS = [
    { key: 'sc', name: '四川省生产环境', desc: '四川省生产环境' },
    { key: 'gz', name: '贵州省生产环境', desc: '贵州省生产环境' },
    { key: 'yn', name: '云南省生产环境', desc: '云南省生产环境' },
    { key: 'shared', name: '共享资源', desc: '跨省共享资源' },
]

// 3rd-level sub-groups
const SUB_GROUPS = [
    { key: 'sc-biz', name: '四川 — 业务', desc: '四川省业务服务', parentKey: 'sc' },
    { key: 'sc-res', name: '四川 — 资源', desc: '四川省生产环境资源节点', parentKey: 'sc' },
    { key: 'gz-biz', name: '贵州 — 业务', desc: '贵州省业务服务', parentKey: 'gz' },
    { key: 'gz-res', name: '贵州 — 资源', desc: '贵州省生产环境资源节点', parentKey: 'gz' },
    { key: 'yn-biz', name: '云南 — 业务', desc: '云南省业务服务', parentKey: 'yn' },
    { key: 'yn-res', name: '云南 — 资源', desc: '云南省生产环境资源节点', parentKey: 'yn' },
]

// Shared clusters under shared group
const SHARED_CLUSTERS = [
    { key: 'share-gwdb', name: 'SHARE-GWDB-01', type: 'GWDB', purpose: '共享网关数据库集群' },
    { key: 'share-kafka', name: 'SHARE-KAFKA-01', type: 'KAFKA', purpose: '共享Kafka消息队列集群' },
]

// Per-province clusters
const PROVINCE_CLUSTERS = [
    { key: 'sc-nslb',   name: 'SC-NSLB-01',   type: 'NSLB',   purpose: '四川负载均衡集群',      groupKey: 'sc-res' },
    { key: 'sc-rcpa',   name: 'SC-RCPA-01',   type: 'RCPA',   purpose: '四川呼叫代理集群',      groupKey: 'sc-res' },
    { key: 'sc-rcpadb', name: 'SC-RCPADB-01',  type: 'RCPADB', purpose: '四川呼叫代理数据库集群', groupKey: 'sc-res' },
    { key: 'gz-nslb',   name: 'GZ-NSLB-01',   type: 'NSLB',   purpose: '贵州负载均衡集群',      groupKey: 'gz-res' },
    { key: 'gz-rcpa',   name: 'GZ-RCPA-01',   type: 'RCPA',   purpose: '贵州呼叫代理集群',      groupKey: 'gz-res' },
    { key: 'gz-rcpadb', name: 'GZ-RCPADB-01',  type: 'RCPADB', purpose: '贵州呼叫代理数据库集群', groupKey: 'gz-res' },
    { key: 'yn-nslb',   name: 'YN-NSLB-01',   type: 'NSLB',   purpose: '云南负载均衡集群',      groupKey: 'yn-res' },
    { key: 'yn-rcpa',   name: 'YN-RCPA-01',   type: 'RCPA',   purpose: '云南呼叫代理集群',      groupKey: 'yn-res' },
    { key: 'yn-rcpadb', name: 'YN-RCPADB-01',  type: 'RCPADB', purpose: '云南呼叫代理数据库集群', groupKey: 'yn-res' },
]

const HOSTS = [
    // Shared: GWDB (2)
    { name: 'gwdb-share-01', ip: '10.100.1.11', cluster: 'share-gwdb', loc: '成都DC-A', purpose: '网关数据库主节点' },
    { name: 'gwdb-share-02', ip: '10.100.1.12', cluster: 'share-gwdb', loc: '成都DC-B', purpose: '网关数据库从节点' },
    // Shared: KAFKA (3)
    { name: 'kafka-share-01', ip: '10.100.2.21', cluster: 'share-kafka', loc: '成都DC-A', purpose: 'Kafka Broker' },
    { name: 'kafka-share-02', ip: '10.100.2.22', cluster: 'share-kafka', loc: '昆明DC-A', purpose: 'Kafka Broker' },
    { name: 'kafka-share-03', ip: '10.100.2.23', cluster: 'share-kafka', loc: '贵阳DC-A', purpose: 'Kafka Broker' },
    // Sichuan: NSLB (2) — 业务入口负载均衡
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

// Relations: full call chain per province
// NSLB(入口) → RCPA(处理) → RCPADB(数据) + KAFKA(消息)
const RELATIONS = [
    // ── Sichuan: NSLB → RCPA (负载转发, 主备各转发2个RCPA节点) ──
    { source: 'nslb-sc-01', target: 'rcpa-sc-01', desc: '负载转发' },
    { source: 'nslb-sc-01', target: 'rcpa-sc-02', desc: '负载转发' },
    { source: 'nslb-sc-02', target: 'rcpa-sc-03', desc: '负载转发' },
    { source: 'nslb-sc-02', target: 'rcpa-sc-04', desc: '负载转发' },
    // Sichuan: RCPA → RCPADB (数据库读写)
    { source: 'rcpa-sc-01', target: 'rcpadb-sc-01', desc: '数据库读写' },
    { source: 'rcpa-sc-02', target: 'rcpadb-sc-02', desc: '数据库读写' },
    // Sichuan: RCPA → KAFKA (消息队列调用)
    { source: 'rcpa-sc-01', target: 'kafka-share-01', desc: '消息队列调用' },
    { source: 'rcpa-sc-02', target: 'kafka-share-02', desc: '消息队列调用' },

    // ── Guizhou: NSLB → RCPA (负载转发) ──
    { source: 'nslb-gz-01', target: 'rcpa-gz-01', desc: '负载转发' },
    { source: 'nslb-gz-01', target: 'rcpa-gz-02', desc: '负载转发' },
    { source: 'nslb-gz-02', target: 'rcpa-gz-03', desc: '负载转发' },
    { source: 'nslb-gz-02', target: 'rcpa-gz-04', desc: '负载转发' },
    // Guizhou: RCPA → RCPADB
    { source: 'rcpa-gz-01', target: 'rcpadb-gz-01', desc: '数据库读写' },
    { source: 'rcpa-gz-02', target: 'rcpadb-gz-02', desc: '数据库读写' },
    // Guizhou: RCPA → KAFKA
    { source: 'rcpa-gz-01', target: 'kafka-share-02', desc: '消息队列调用' },
    { source: 'rcpa-gz-02', target: 'kafka-share-03', desc: '消息队列调用' },

    // ── Yunnan: NSLB → RCPA (负载转发) ──
    { source: 'nslb-yn-01', target: 'rcpa-yn-01', desc: '负载转发' },
    { source: 'nslb-yn-01', target: 'rcpa-yn-02', desc: '负载转发' },
    { source: 'nslb-yn-02', target: 'rcpa-yn-03', desc: '负载转发' },
    { source: 'nslb-yn-02', target: 'rcpa-yn-04', desc: '负载转发' },
    // Yunnan: RCPA → RCPADB
    { source: 'rcpa-yn-01', target: 'rcpadb-yn-01', desc: '数据库读写' },
    { source: 'rcpa-yn-02', target: 'rcpadb-yn-02', desc: '数据库读写' },
    // Yunnan: RCPA → KAFKA
    { source: 'rcpa-yn-01', target: 'kafka-share-01', desc: '消息队列调用' },
    { source: 'rcpa-yn-02', target: 'kafka-share-03', desc: '消息队列调用' },
]

// Business services — all use NSLB hosts as entry resources (入口负载均衡)
// 每省2个 (查询+上报), 共6个, 关联 businessTypeId
const BUSINESS_SERVICES = [
    {
        key: 'bs-sc-query',
        name: '四川彩铃查询业务',
        code: 'SC-CR-QUERY',
        groupKey: 'sc-biz',
        businessTypeKey: 'colorring-query',
        entryHostNames: ['nslb-sc-01', 'nslb-sc-02'],
        description: '四川省彩铃查询业务入口，经NSLB负载分发到RCPA处理',
        tags: ['彩铃查询', '四川'],
        priority: 'P1',
    },
    {
        key: 'bs-sc-upload',
        name: '四川彩铃上报业务',
        code: 'SC-CR-UPLOAD',
        groupKey: 'sc-biz',
        businessTypeKey: 'colorring-upload',
        entryHostNames: ['nslb-sc-01', 'nslb-sc-02'],
        description: '四川省彩铃上报业务入口，经NSLB分发到RCPA处理后写入RCPADB并通知Kafka',
        tags: ['彩铃上报', '四川'],
        priority: 'P1',
    },
    {
        key: 'bs-gz-query',
        name: '贵州彩铃查询业务',
        code: 'GZ-CR-QUERY',
        groupKey: 'gz-biz',
        businessTypeKey: 'colorring-query',
        entryHostNames: ['nslb-gz-01', 'nslb-gz-02'],
        description: '贵州省彩铃查询业务入口，经NSLB负载分发到RCPA处理',
        tags: ['彩铃查询', '贵州'],
        priority: 'P2',
    },
    {
        key: 'bs-gz-upload',
        name: '贵州彩铃上报业务',
        code: 'GZ-CR-UPLOAD',
        groupKey: 'gz-biz',
        businessTypeKey: 'colorring-upload',
        entryHostNames: ['nslb-gz-01', 'nslb-gz-02'],
        description: '贵州省彩铃上报业务入口，经NSLB分发到RCPA处理后写入RCPADB并通知Kafka',
        tags: ['彩铃上报', '贵州'],
        priority: 'P2',
    },
    {
        key: 'bs-yn-query',
        name: '云南彩铃查询业务',
        code: 'YN-CR-QUERY',
        groupKey: 'yn-biz',
        businessTypeKey: 'colorring-query',
        entryHostNames: ['nslb-yn-01', 'nslb-yn-02'],
        description: '云南省彩铃查询业务入口，经NSLB负载分发到RCPA处理',
        tags: ['彩铃查询', '云南'],
        priority: 'P2',
    },
    {
        key: 'bs-yn-upload',
        name: '云南彩铃上报业务',
        code: 'YN-CR-UPLOAD',
        groupKey: 'yn-biz',
        businessTypeKey: 'colorring-upload',
        entryHostNames: ['nslb-yn-01', 'nslb-yn-02'],
        description: '云南省彩铃上报业务入口，经NSLB分发到RCPA处理后写入RCPADB并通知Kafka',
        tags: ['彩铃上报', '云南'],
        priority: 'P2',
    },
]

// ── Test environment data ──────────────────────────────────────────────────
// 测试环境：haproxy → core-service，各2台主机，1个查询接口业务

const TEST_ENV_CLUSTERS = [
    { key: 'test-haproxy', name: 'TEST-HAPROXY-01', type: 'HAPROXY', purpose: '测试环境HAProxy负载均衡集群' },
    { key: 'test-core-service', name: 'TEST-CORE-SERVICE-01', type: 'CORE_SERVICE', purpose: '测试环境核心服务集群' },
]

const TEST_ENV_HOSTS = [
    { name: 'haproxy-test-01', ip: '10.200.1.11', cluster: 'test-haproxy', loc: '测试DC-A', purpose: 'HAProxy主节点' },
    { name: 'haproxy-test-02', ip: '10.200.1.12', cluster: 'test-haproxy', loc: '测试DC-B', purpose: 'HAProxy备节点' },
    { name: 'core-svc-test-01', ip: '10.200.2.21', cluster: 'test-core-service', loc: '测试DC-A', purpose: '核心服务主节点' },
    { name: 'core-svc-test-02', ip: '10.200.2.22', cluster: 'test-core-service', loc: '测试DC-B', purpose: '核心服务备节点' },
]

const TEST_ENV_RELATIONS = [
    // HAProxy → Core-Service (负载转发)
    { source: 'haproxy-test-01', target: 'core-svc-test-01', desc: '负载转发' },
    { source: 'haproxy-test-01', target: 'core-svc-test-02', desc: '负载转发' },
    { source: 'haproxy-test-02', target: 'core-svc-test-01', desc: '负载转发' },
    { source: 'haproxy-test-02', target: 'core-svc-test-02', desc: '负载转发' },
]

const TEST_ENV_BUSINESS_SERVICES = [
    {
        key: 'bs-test-query',
        name: '查询接口',
        code: 'QUERY_TEST',
        businessTypeKey: 'query-test',
        entryHostNames: ['haproxy-test-01', 'haproxy-test-02'],
        description: '测试环境查询接口业务，经HAProxy负载分发到核心服务处理',
        tags: ['查询接口', '测试环境'],
        priority: 'P3',
    },
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

    // Delete in dependency order: business-services → relations → hosts → clusters → groups → types
    const bss: any[] = (await apiGet(request, '/business-services')).businessServices || []
    for (const bs of bss) {
        await apiDelete(request, `/business-services/${bs.id}`)
    }

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
    let totalGroupsDeleted = 0
    for (let pass = 0; pass < 5; pass++) {
        const groups: any[] = (await apiGet(request, '/host-groups')).groups || []
        if (groups.length === 0) break
        const sorted = [...groups].sort((a, b) => (a.parentId ? 0 : 1) - (b.parentId ? 0 : 1))
        let deleted = 0
        for (const g of sorted) {
            const status = await apiDelete(request, `/host-groups/${g.id}`)
            if (status < 400) deleted++
        }
        totalGroupsDeleted += deleted
        if (deleted === 0) break
    }

    // Delete cluster types
    const clusterTypes: any[] = (await apiGet(request, '/cluster-types')).clusterTypes || []
    for (const ct of clusterTypes) {
        await apiDelete(request, `/cluster-types/${ct.id}`)
    }

    // Delete business types
    const businessTypes: any[] = (await apiGet(request, '/business-types')).businessTypes || []
    for (const bt of businessTypes) {
        await apiDelete(request, `/business-types/${bt.id}`)
    }

    console.log(`Cleaned: ${bss.length} business-services, ${relations.length} relations, ${hosts.length} hosts, ${clusters.length} clusters, ${totalGroupsDeleted} groups, ${clusterTypes.length} cluster-types, ${businessTypes.length} business-types`)
}

// ── Test ────────────────────────────────────────────────────────────────────

test.describe('咪咕视频彩铃西南大区生产环境 — Sample Data', () => {
    test.setTimeout(120_000)

    const groupIds: IdMap = {}
    const clusterIds: IdMap = {}
    const hostIds: IdMap = {}
    const businessTypeIds: IdMap = {}

    test('cleanup, seed data and verify page', async ({ page, request }) => {
        // ── Step 0: Clean all existing data ──────────────────────────
        await cleanupAll(request)

        // ── Step 1: Create cluster types ────────────────────────────
        for (const ct of CLUSTER_TYPE_DEFS) {
            await apiPost(request, '/cluster-types', {
                name: ct.name,
                code: ct.code,
                description: ct.description,
                color: ct.color,
                knowledge: ct.knowledge,
            })
        }
        console.log(`Created ${CLUSTER_TYPE_DEFS.length} cluster types`)

        // ── Step 2: Create business types (capture IDs) ──────────────
        for (const bt of BUSINESS_TYPE_DEFS) {
            const res = await apiPost(request, '/business-types', {
                name: bt.name,
                code: bt.code,
                description: bt.description,
                color: bt.color,
                knowledge: bt.knowledge,
            })
            businessTypeIds[bt.key] = res.businessType.id
        }
        console.log(`Created ${BUSINESS_TYPE_DEFS.length} business types`)

        // ── Step 3: Create groups via API ──────────────────────────
        const topGroup = await apiPost(request, '/host-groups', {
            name: '咪咕视频彩铃西南大区生产环境',
            description: '咪咕视频彩铃业务西南大区生产环境资源管理',
        })
        groupIds['top'] = topGroup.group.id

        // 2nd-level: province groups
        for (const pg of PROVINCE_GROUPS) {
            const res = await apiPost(request, '/host-groups', {
                name: pg.name,
                parentId: groupIds['top'],
                description: pg.desc,
            })
            groupIds[pg.key] = res.group.id
        }

        // 3rd-level: biz/res sub-groups under each province
        for (const sg of SUB_GROUPS) {
            const res = await apiPost(request, '/host-groups', {
                name: sg.name,
                parentId: groupIds[sg.parentKey],
                description: sg.desc,
            })
            groupIds[sg.key] = res.group.id
        }
        console.log(`Created 1 top group + ${PROVINCE_GROUPS.length} province groups + ${SUB_GROUPS.length} sub-groups`)

        // ── Step 4: Create shared clusters (under shared group) ────────
        for (const cl of SHARED_CLUSTERS) {
            const res = await apiPost(request, '/clusters', {
                name: cl.name,
                type: cl.type,
                purpose: cl.purpose,
                groupId: groupIds['shared'],
                description: cl.purpose,
            })
            clusterIds[cl.key] = res.cluster.id
        }

        // ── Step 5: Create per-province clusters ────────────────────
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

        // ── Step 6: Create hosts via API ────────────────────────────
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

        // ── Step 7: Create relations via API ────────────────────────
        for (const rel of RELATIONS) {
            await apiPost(request, '/host-relations', {
                sourceHostId: hostIds[rel.source],
                targetHostId: hostIds[rel.target],
                description: rel.desc,
            })
        }
        console.log(`Created ${RELATIONS.length} relations`)

        // ── Step 8: Create business services (with hostIds + businessTypeId) ──
        for (const bs of BUSINESS_SERVICES) {
            await apiPost(request, '/business-services', {
                name: bs.name,
                code: bs.code,
                groupId: groupIds[bs.groupKey],
                businessTypeId: businessTypeIds[bs.businessTypeKey] || null,
                description: bs.description,
                hostIds: bs.entryHostNames.map(n => hostIds[n]).filter(Boolean),
                tags: bs.tags,
                priority: bs.priority,
                contactInfo: '',
            })
        }
        console.log(`Created ${BUSINESS_SERVICES.length} business services`)

        // ── Step 8b: Seed test environment ───────────────────────────
        // Group: 测试环境
        const testEnvGroup = await apiPost(request, '/host-groups', {
            name: '测试环境',
            description: '测试环境资源管理',
        })
        groupIds['test-env'] = testEnvGroup.group.id

        // Clusters under test group
        for (const cl of TEST_ENV_CLUSTERS) {
            const res = await apiPost(request, '/clusters', {
                name: cl.name,
                type: cl.type,
                purpose: cl.purpose,
                groupId: groupIds['test-env'],
                description: cl.purpose,
            })
            clusterIds[cl.key] = res.cluster.id
        }

        // Hosts
        for (const h of TEST_ENV_HOSTS) {
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
                tags: [],
                description: h.purpose,
            })
            hostIds[h.name] = res.host.id
        }

        // Relations: haproxy → core-service
        for (const rel of TEST_ENV_RELATIONS) {
            await apiPost(request, '/host-relations', {
                sourceHostId: hostIds[rel.source],
                targetHostId: hostIds[rel.target],
                description: rel.desc,
            })
        }

        // Business service: 查询接口
        for (const bs of TEST_ENV_BUSINESS_SERVICES) {
            await apiPost(request, '/business-services', {
                name: bs.name,
                code: bs.code,
                groupId: groupIds['test-env'],
                businessTypeId: businessTypeIds[bs.businessTypeKey] || null,
                description: bs.description,
                hostIds: bs.entryHostNames.map(n => hostIds[n]).filter(Boolean),
                tags: bs.tags,
                priority: bs.priority,
                contactInfo: '',
            })
        }

        console.log(`Created test environment: 1 group, ${TEST_ENV_CLUSTERS.length} clusters, ${TEST_ENV_HOSTS.length} hosts, ${TEST_ENV_RELATIONS.length} relations, ${TEST_ENV_BUSINESS_SERVICES.length} business service`)

        // ── Step 9: Navigate and verify UI ──────────────────────────
        await page.goto('/', { timeout: 30000, waitUntil: 'domcontentloaded' })
        await page.evaluate(() => localStorage.setItem('ops-factory-user', 'admin'))
        await page.goto('/#/host-resource', { timeout: 30000, waitUntil: 'domcontentloaded' })
        await page.waitForSelector('.host-resource-page', { timeout: 30000 })
        await page.waitForTimeout(2000)
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

        // Verify sub-groups in tree (province groups + 3rd-level groups)
        for (const pg of PROVINCE_GROUPS) {
            const pgNode = page.locator('.hr-tree-node').filter({ hasText: pg.name }).first()
            await expect(pgNode, `Province group ${pg.name} should be in tree`).toBeVisible({ timeout: 5000 })
        }
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

        // Verify all 6 business services in tree
        for (const bs of BUSINESS_SERVICES) {
            const bsNode = page.locator('.hr-tree-node').filter({ hasText: bs.name }).first()
            await expect(bsNode, `Business service ${bs.name} should be in tree`).toBeVisible({ timeout: 5000 })
        }
        await ss(page, '05-tree-business-services')

        // Verify test environment group and its resources in tree
        const testEnvGroupNode = page.locator('.hr-tree-node').filter({ hasText: '测试环境' }).first()
        await expect(testEnvGroupNode, 'Test environment group should be in tree').toBeVisible({ timeout: 5000 })

        for (const cl of TEST_ENV_CLUSTERS) {
            const clNode = page.locator('.hr-tree-node').filter({ hasText: cl.name }).first()
            await expect(clNode, `Test cluster ${cl.name} should be in tree`).toBeVisible({ timeout: 5000 })
        }

        for (const bs of TEST_ENV_BUSINESS_SERVICES) {
            const bsNode = page.locator('.hr-tree-node').filter({ hasText: bs.name }).first()
            await expect(bsNode, `Test business service ${bs.name} should be in tree`).toBeVisible({ timeout: 5000 })
        }
        await ss(page, '05a-test-env-in-tree')

        // ── Step 9b: Click a business service → verify province hosts ──
        const scQueryBsNode = page.locator('.hr-tree-node').filter({ hasText: '四川彩铃查询业务' }).first()
        await scQueryBsNode.click()
        await page.waitForSelector('.hr-host-card', { timeout: 10000 })
        await page.waitForTimeout(500)
        await ss(page, '05b-business-service-selected')

        const bsCards = page.locator('.hr-host-card')
        const bsCardCount = await bsCards.count()
        console.log(`Business service click → ${bsCardCount} host cards`)
        expect(bsCardCount, 'Business service should show province resource hosts').toBeGreaterThanOrEqual(1)

        // Spot check: nslb-sc-01 (first Sichuan host, most likely on first page)
        await expect(bsCards.filter({ hasText: 'nslb-sc-01' }).first(), 'nslb-sc-01 should appear under BS click').toBeVisible({ timeout: 5000 })

        // Check pagination info for total count (Sichuan has 8 hosts: 2 NSLB + 4 RCPA + 2 RCPADB)
        const bsPaginationInfo = page.locator('.hr-pagination-info')
        if (await bsPaginationInfo.isVisible()) {
            const infoText = await bsPaginationInfo.textContent()
            console.log('BS click pagination info:', infoText)
            expect(infoText, 'Sichuan province should have 8 hosts total').toMatch(/8/)
        }

        // ── Step 10: Click a cluster → verify card filtering ─────────
        const scNslbNode = page.locator('.hr-tree-node').filter({ hasText: 'SC-NSLB-01' }).first()
        await scNslbNode.click()
        await page.waitForSelector('.hr-host-card', { timeout: 5000 })

        const hostCards = page.locator('.hr-host-card')
        const cardCount = await hostCards.count()
        expect(cardCount, 'SC-NSLB-01 should have 2 host cards').toBeGreaterThanOrEqual(2)
        await ss(page, '06-cluster-selected-cards')

        // Verify specific host names appear
        await expect(hostCards.filter({ hasText: 'nslb-sc-01' }).first()).toBeVisible()
        await expect(hostCards.filter({ hasText: 'nslb-sc-02' }).first()).toBeVisible()

        // ── Step 11: Click top-level group → verify all hosts ────────
        const topNode = page.locator('.hr-tree-node').filter({ hasText: '咪咕视频彩铃西南大区生产环境' }).first()
        await topNode.click()
        await page.waitForSelector('.hr-host-card', { timeout: 5000 })
        await page.waitForTimeout(500)

        const allCards = page.locator('.hr-host-card')
        const allCount = await allCards.count()
        expect(allCount, 'Top-level group should show host cards').toBeGreaterThanOrEqual(1)
        const paginationInfo = page.locator('.hr-pagination-info')
        if (await paginationInfo.isVisible()) {
            const infoText = await paginationInfo.textContent()
            console.log('Pagination info:', infoText)
        }
        await ss(page, '07-all-hosts')

        // ── Step 12: Verify topology rendered ─────────────────────────
        const svgInTopology = topologyArea.locator('svg')
        await expect(svgInTopology.first(), 'Topology should render SVG graph').toBeVisible({ timeout: 5000 })
        await ss(page, '08-topology-rendered')

        // ── Step 13: Click a host card → verify topology focus ───────
        const firstVisibleCard = allCards.first()
        await firstVisibleCard.click()
        await page.waitForTimeout(500)
        await ss(page, '09-host-card-clicked-focus')

        // Click again to unfocus
        await firstVisibleCard.click()
        await page.waitForTimeout(300)
        await ss(page, '10-host-unfocused')

        // ── Step 13b: Verify test environment — click 测试环境 → verify hosts ──
        const testEnvNode = page.locator('.hr-tree-node').filter({ hasText: '测试环境' }).first()
        await testEnvNode.click()
        await page.waitForSelector('.hr-host-card', { timeout: 5000 })
        await page.waitForTimeout(500)

        const testEnvCards = page.locator('.hr-host-card')
        const testEnvCardCount = await testEnvCards.count()
        expect(testEnvCardCount, 'Test environment should show 4 host cards').toBeGreaterThanOrEqual(4)
        await ss(page, '10b-test-env-hosts')

        // Verify specific test hosts
        await expect(testEnvCards.filter({ hasText: 'haproxy-test-01' }).first()).toBeVisible()
        await expect(testEnvCards.filter({ hasText: 'core-svc-test-01' }).first()).toBeVisible()

        // Click test business service → verify entry hosts
        const testQueryBsNode = page.locator('.hr-tree-node').filter({ hasText: '查询接口' }).first()
        await testQueryBsNode.click()
        await page.waitForSelector('.hr-host-card', { timeout: 5000 })
        await page.waitForTimeout(500)

        const testBsCards = page.locator('.hr-host-card')
        const testBsCount = await testBsCards.count()
        expect(testBsCount, 'Test business service should show hosts').toBeGreaterThanOrEqual(1)
        await ss(page, '10c-test-bs-selected')

        // ── Step 14: Verify "Cluster Types" tab ──────────────────────
        const tabs = page.locator('.hr-tab')
        await expect(tabs.nth(1), 'Cluster Types tab should be visible').toBeVisible()
        await tabs.nth(1).click()
        await page.waitForTimeout(500)

        // Verify cluster type cards
        const ctCards = page.locator('.hr-type-def-card')
        const ctCount = await ctCards.count()
        expect(ctCount, 'Should show cluster type cards').toBeGreaterThanOrEqual(CLUSTER_TYPE_DEFS.length)
        await ss(page, '11-cluster-types-tab')

        // Spot check: NSLB card visible
        await expect(ctCards.filter({ hasText: 'NSLB' }).first(), 'NSLB cluster type card should be visible').toBeVisible()

        // Spot check: HAPROXY card visible (test environment)
        await expect(ctCards.filter({ hasText: 'HAPROXY' }).first(), 'HAPROXY cluster type card should be visible').toBeVisible()
        await expect(ctCards.filter({ hasText: 'CORE_SERVICE' }).first(), 'CORE_SERVICE cluster type card should be visible').toBeVisible()

        // ── Step 15: Verify "Business Types" tab ─────────────────────
        await expect(tabs.nth(2), 'Business Types tab should be visible').toBeVisible()
        await tabs.nth(2).click()
        await page.waitForTimeout(500)

        // Verify business type cards
        const btCards = page.locator('.hr-type-def-card')
        const btCount = await btCards.count()
        expect(btCount, 'Should show business type cards').toBeGreaterThanOrEqual(BUSINESS_TYPE_DEFS.length)
        await ss(page, '12-business-types-tab')

        // Spot check: 彩铃查询业务 card visible
        const queryCard = btCards.filter({ hasText: /彩铃查询|colorring-query/ }).first()
        await expect(queryCard, 'Colorring query card should be visible').toBeVisible()

        // Spot check: 查询接口 card visible (test environment)
        const testQueryCard = btCards.filter({ hasText: /查询接口|QUERY_TEST/ }).first()
        await expect(testQueryCard, 'Query test business type card should be visible').toBeVisible()

        console.log('All verifications passed — data kept in system')
    })
})
