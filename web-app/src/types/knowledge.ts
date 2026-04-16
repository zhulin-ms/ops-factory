export interface PagedResponse<T> {
    items: T[]
    page: number
    pageSize: number
    total: number
}

export interface KnowledgeSource {
    id: string
    name: string
    description: string | null
    status: string
    storageMode: string
    indexProfileId: string | null
    retrievalProfileId: string | null
    runtimeStatus: string
    runtimeMessage: string | null
    currentJobId: string | null
    lastJobError: string | null
    rebuildRequired: boolean
    createdAt: string
    updatedAt: string
}

export interface KnowledgeSourceStats {
    sourceId: string
    documentCount: number
    indexedDocumentCount: number
    failedDocumentCount: number
    processingDocumentCount: number
    chunkCount: number
    userEditedChunkCount: number
    lastIngestionAt: string | null
}

export interface KnowledgeMaintenanceJobSummary {
    id: string
    type: string
    status: string
    stage: string | null
    createdBy: string | null
    startedAt: string | null
    updatedAt: string | null
    finishedAt: string | null
    totalDocuments: number
    processedDocuments: number
    successDocuments: number
    failedDocuments: number
    currentDocumentId: string | null
    currentDocumentName: string | null
    message: string | null
    errorSummary: string | null
}

export interface KnowledgeMaintenanceOverview {
    sourceId: string
    currentJob: KnowledgeMaintenanceJobSummary | null
    lastCompletedJob: KnowledgeMaintenanceJobSummary | null
}

export interface KnowledgeMaintenanceFailure {
    documentId: string | null
    documentName: string | null
    stage: string
    errorCode: string | null
    message: string
    finishedAt: string
}

export interface KnowledgeFeatureFlags {
    allowChunkEdit: boolean
    allowChunkDelete: boolean
    allowExplain: boolean
    allowRequestOverride: boolean
}

export interface KnowledgeCapabilities {
    retrievalModes: string[]
    chunkModes: string[]
    expandModes: string[]
    analyzers: string[]
    editableChunkFields: string[]
    featureFlags: KnowledgeFeatureFlags
}

export interface KnowledgeDefaults {
    ingest: {
        maxFileSizeMb: number
        allowedContentTypes: string[]
        deduplication: string
        skipExistingByDefault: boolean
    }
    chunking: {
        mode: string
        targetTokens: number
        overlapTokens: number
        respectHeadings: boolean
        keepTablesWhole: boolean
    }
    retrieval: {
        mode: string
        lexicalTopK: number
        semanticTopK: number
        finalTopK: number
        rrfK: number
        semanticThreshold: number
        lexicalThreshold: number
    }
    features: KnowledgeFeatureFlags
}

export interface KnowledgeProfileSummary {
    id: string
    name: string
    summary: Record<string, unknown>
    createdAt: string
    updatedAt: string
}

export interface KnowledgeProfileDetail {
    id: string
    name: string
    scope?: string
    readonly?: boolean
    ownerSourceId?: string | null
    derivedFromProfileId?: string | null
    config: Record<string, unknown>
    createdAt: string
    updatedAt: string
}

export interface KnowledgeSourceProfileConfig extends KnowledgeProfileDetail {
    sourceId: string
    rebuildRequired: boolean
    createdFromDefault: boolean
}

export interface KnowledgeDocumentSummary {
    id: string
    sourceId: string
    name: string
    contentType: string
    title: string
    status: string
    indexStatus: string
    fileSizeBytes: number
    chunkCount: number
    userEditedChunkCount: number
    createdAt: string
    updatedAt: string
}

export interface KnowledgeDocumentArtifacts {
    documentId: string
    markdown: boolean
}

export interface KnowledgeDocumentPreview {
    documentId: string
    title: string
    markdownPreview: string
}

export interface KnowledgeChunkSummary {
    id: string
    documentId: string
    sourceId: string
    ordinal: number
    title: string | null
    titlePath: string[]
    keywords: string[]
    snippet: string
    pageFrom: number | null
    pageTo: number | null
    tokenCount: number
    editStatus: string
    updatedAt: string
}

export interface KnowledgeChunkDetail {
    id: string
    documentId: string
    sourceId: string
    ordinal: number
    title: string | null
    titlePath: string[]
    keywords: string[]
    text: string
    markdown: string
    pageFrom: number | null
    pageTo: number | null
    tokenCount: number
    textLength: number
    editStatus: string
    updatedBy: string | null
    createdAt: string
    updatedAt: string
}

export interface KnowledgeChunkMutationResponse {
    id: string
    documentId: string
    reembedded: boolean
    reindexed: boolean
    editStatus: string
    updatedAt: string
}

export interface KnowledgeIngestResponse {
    jobId: string
    sourceId: string
    status: string
    documentCount: number
}

export interface KnowledgeJobResponse {
    jobId: string
    status: string
    sourceId?: string
    documentId?: string
}

export interface KnowledgeSourceUpdateRequest {
    name?: string
    description?: string | null
    status?: string
    indexProfileId?: string | null
    retrievalProfileId?: string | null
}
