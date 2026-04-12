export interface Host {
    id: string
    name: string
    hostname?: string
    ip: string
    port: number
    os?: string
    location?: string
    username: string
    authType: 'password' | 'key'
    credential?: string
    business?: string
    clusterId?: string
    purpose?: string
    tags: string[]
    description: string
    customAttributes?: CustomAttribute[]
    createdAt: string
    updatedAt: string
}

export interface CustomAttribute {
    key: string
    value: string
}

export interface HostCreateRequest {
    name: string
    hostname?: string
    ip: string
    port: number
    os?: string
    location?: string
    username: string
    authType: 'password' | 'key'
    credential: string
    business?: string
    clusterId?: string
    purpose?: string
    tags: string[]
    description?: string
    customAttributes?: CustomAttribute[]
}

export interface HostTestResult {
    success: boolean
    message: string
    latency?: string
}

export interface HostGroup {
    id: string
    name: string
    parentId?: string | null
    description: string
    createdAt: string
    updatedAt: string
}

export interface Cluster {
    id: string
    name: string
    type: string
    purpose: string
    groupId?: string | null
    description: string
    createdAt: string
    updatedAt: string
}

export interface HostRelation {
    id: string
    sourceHostId: string
    targetHostId: string
    description: string
    createdAt: string
    updatedAt: string
}

export interface GraphNode {
    id: string
    name: string
    ip: string
    clusterType?: string | null
    clusterName?: string | null
    purpose?: string | null
    groupId?: string | null
}

export interface GraphEdge {
    source: string
    target: string
    description: string
}

export interface GraphData {
    nodes: GraphNode[]
    edges: GraphEdge[]
}

export interface DiscoveryCommand {
    label: string
    command: string
    purpose: string
}

export interface DiscoveryPlan {
    success: boolean
    hostId: string
    commands: DiscoveryCommand[]
    error?: string
}

export interface HostDiscoveryResult {
    success: boolean
    hostId: string
    formMappings?: { hostname?: string; os?: string }
    customAttributes?: CustomAttribute[]
    rawOutputs?: Record<string, string>
    error?: string
}
