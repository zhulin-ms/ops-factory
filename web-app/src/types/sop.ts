export interface SopNodeVariable {
    name: string
    description: string
    defaultValue: string
    required: boolean
}

export interface SopNode {
    id: string
    name: string
    type: 'start' | 'analysis' | 'browser' | 'end'
    tags: string[]
    command: string
    commandVariables: Record<string, SopCommandVariable>
    variables?: SopNodeVariable[]
    outputFormat: string
    analysisInstruction: string
    transitions: SopTransition[]
    browserUrl?: string
    browserAction?: string
    browserMode?: 'headless' | 'headed'
}

export interface SopCommandVariable {
    description: string
    defaultValue: string
    required: boolean
}

export interface SopTransition {
    condition: string
    description: string
    nextNodes: string[]
    nextNodeId?: string
    requireHumanConfirm?: boolean
}

export interface Sop {
    id: string
    name: string
    description: string
    version: string
    triggerCondition: string
    enabled?: boolean
    mode?: 'structured' | 'natural_language'
    nodes: SopNode[]
    stepsDescription?: string
    tags?: string[]
}

export interface SopCreateRequest {
    name: string
    description?: string
    version?: string
    triggerCondition?: string
    enabled?: boolean
    mode?: 'structured' | 'natural_language'
    nodes?: SopNode[]
    stepsDescription?: string
    tags?: string[]
}
