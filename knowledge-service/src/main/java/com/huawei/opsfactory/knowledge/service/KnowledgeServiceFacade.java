package com.huawei.opsfactory.knowledge.service;

import com.huawei.opsfactory.knowledge.api.chunk.ChunkController;
import com.huawei.opsfactory.knowledge.api.document.DocumentController;
import com.huawei.opsfactory.knowledge.api.job.JobController;
import com.huawei.opsfactory.knowledge.api.profile.ProfileController;
import com.huawei.opsfactory.knowledge.api.retrieval.RetrievalController;
import com.huawei.opsfactory.knowledge.api.source.SourceController;
import com.huawei.opsfactory.knowledge.common.error.ApiConflictException;
import com.huawei.opsfactory.knowledge.common.model.PageResponse;
import com.huawei.opsfactory.knowledge.common.util.Ids;
import com.huawei.opsfactory.knowledge.config.KnowledgeProperties;
import com.huawei.opsfactory.knowledge.repository.BindingRepository;
import com.huawei.opsfactory.knowledge.repository.ChunkRepository;
import com.huawei.opsfactory.knowledge.repository.DocumentRepository;
import com.huawei.opsfactory.knowledge.repository.JobRepository;
import com.huawei.opsfactory.knowledge.repository.MaintenanceJobFailureRepository;
import com.huawei.opsfactory.knowledge.repository.ProfileRepository;
import com.huawei.opsfactory.knowledge.repository.SourceRepository;
import java.io.InputStream;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

@Service
public class KnowledgeServiceFacade {

    private static final int COMPARE_FETCH_TOP_K = 64;

    private final SourceRepository sourceRepository;
    private final DocumentRepository documentRepository;
    private final ChunkRepository chunkRepository;
    private final JobRepository jobRepository;
    private final MaintenanceJobFailureRepository maintenanceJobFailureRepository;
    private final ProfileRepository profileRepository;
    private final BindingRepository bindingRepository;
    private final StorageManager storageManager;
    private final TikaConversionService conversionService;
    private final ChunkingService chunkingService;
    private final SearchService searchService;
    private final EmbeddingService embeddingService;
    private final LexicalIndexService lexicalIndexService;
    private final VectorIndexService vectorIndexService;
    private final ProfileBootstrapService profileBootstrapService;
    private final ThreadPoolTaskExecutor taskExecutor;

    public KnowledgeServiceFacade(
        SourceRepository sourceRepository,
        DocumentRepository documentRepository,
        ChunkRepository chunkRepository,
        JobRepository jobRepository,
        MaintenanceJobFailureRepository maintenanceJobFailureRepository,
        ProfileRepository profileRepository,
        BindingRepository bindingRepository,
        StorageManager storageManager,
        TikaConversionService conversionService,
        ChunkingService chunkingService,
        SearchService searchService,
        EmbeddingService embeddingService,
        LexicalIndexService lexicalIndexService,
        VectorIndexService vectorIndexService,
        ProfileBootstrapService profileBootstrapService,
        ThreadPoolTaskExecutor taskExecutor
    ) {
        this.sourceRepository = sourceRepository;
        this.documentRepository = documentRepository;
        this.chunkRepository = chunkRepository;
        this.jobRepository = jobRepository;
        this.maintenanceJobFailureRepository = maintenanceJobFailureRepository;
        this.profileRepository = profileRepository;
        this.bindingRepository = bindingRepository;
        this.storageManager = storageManager;
        this.conversionService = conversionService;
        this.chunkingService = chunkingService;
        this.searchService = searchService;
        this.embeddingService = embeddingService;
        this.lexicalIndexService = lexicalIndexService;
        this.vectorIndexService = vectorIndexService;
        this.profileBootstrapService = profileBootstrapService;
        this.taskExecutor = taskExecutor;
    }

    public PageResponse<SourceController.SourceResponse> listSources(int page, int pageSize) {
        List<SourceController.SourceResponse> items = sourceRepository.findAll().stream().map(this::toSourceResponse).toList();
        return page(items, page, pageSize);
    }

    @Transactional
    public SourceController.SourceResponse createSource(SourceController.CreateSourceRequest request) {
        Instant now = Instant.now();
        String id = Ids.newId("src");
        String indexProfileId = request.indexProfileId() != null ? request.indexProfileId() : profileBootstrapService.defaultIndexProfileId();
        String retrievalProfileId = request.retrievalProfileId() != null ? request.retrievalProfileId() : profileBootstrapService.defaultRetrievalProfileId();
        validateIndexProfileExists(indexProfileId);
        validateRetrievalProfileExists(retrievalProfileId);
        SourceRepository.SourceRecord record = new SourceRepository.SourceRecord(
            id, request.name(), request.description(), "ACTIVE", "MANAGED", indexProfileId, retrievalProfileId,
            "ACTIVE", null, null, null, false, now, now
        );
        sourceRepository.insert(record);
        bindingRepository.upsert(new BindingRepository.BindingRecord(Ids.newId("spb"), id, indexProfileId, retrievalProfileId, now, now));
        return toSourceResponse(record);
    }

    public SourceController.SourceResponse getSource(String sourceId) {
        return sourceRepository.findById(sourceId).map(this::toSourceResponse)
            .orElseThrow(() -> new IllegalArgumentException("Source not found: " + sourceId));
    }

    @Transactional
    public SourceController.SourceResponse updateSource(String sourceId, SourceController.UpdateSourceRequest request) {
        SourceRepository.SourceRecord existing = sourceRepository.findById(sourceId)
            .orElseThrow(() -> new IllegalArgumentException("Source not found: " + sourceId));
        ensureSourceWritable(existing);
        Instant now = Instant.now();
        String indexProfileId = request.indexProfileId() != null ? request.indexProfileId() : existing.indexProfileId();
        String retrievalProfileId = request.retrievalProfileId() != null ? request.retrievalProfileId() : existing.retrievalProfileId();
        validateIndexProfileExists(indexProfileId);
        validateRetrievalProfileExists(retrievalProfileId);
        SourceRepository.SourceRecord updated = new SourceRepository.SourceRecord(
            sourceId,
            request.name() != null ? request.name() : existing.name(),
            request.description() != null ? request.description() : existing.description(),
            request.status() != null ? request.status() : existing.status(),
            existing.storageMode(),
            indexProfileId,
            retrievalProfileId,
            existing.runtimeStatus(),
            existing.runtimeMessage(),
            existing.currentJobId(),
            existing.lastJobError(),
            existing.rebuildRequired() || !indexProfileId.equals(existing.indexProfileId()),
            existing.createdAt(),
            now
        );
        sourceRepository.update(updated);
        bindingRepository.upsert(new BindingRepository.BindingRecord(
            Ids.newId("spb"), sourceId, updated.indexProfileId(), updated.retrievalProfileId(), existing.createdAt(), now
        ));
        return toSourceResponse(updated);
    }

    @Transactional
    public SourceController.DeleteSourceResponse deleteSource(String sourceId) {
        SourceRepository.SourceRecord source = sourceRepository.findById(sourceId)
            .orElseThrow(() -> new IllegalArgumentException("Source not found: " + sourceId));
        ensureSourceWritable(source);
        List<DocumentRepository.DocumentRecord> documents = documentRepository.findBySourceId(sourceId);
        for (DocumentRepository.DocumentRecord document : documents) {
            storageManager.deleteRecursively(storageManager.artifactDir(sourceId, document.id()));
            storageManager.deleteRecursively(storageManager.uploadDocumentDir(sourceId, document.id()));
        }
        lexicalIndexService.deleteSource(sourceId);
        vectorIndexService.deleteSource(sourceId);
        chunkRepository.deleteBySourceId(sourceId);
        documentRepository.deleteBySourceId(sourceId);
        jobRepository.deleteBySourceId(sourceId);
        bindingRepository.deleteBySourceId(sourceId);
        sourceRepository.delete(source.id());
        storageManager.deleteRecursively(storageManager.artifactSourceDir(sourceId));
        storageManager.deleteRecursively(storageManager.uploadSourceDir(sourceId));
        return new SourceController.DeleteSourceResponse(sourceId, true);
    }

    public SourceController.SourceStatsResponse sourceStats(String sourceId) {
        long documentCount = documentRepository.findBySourceId(sourceId).size();
        long indexedCount = documentRepository.findBySourceId(sourceId).stream().filter(d -> "INDEXED".equals(d.status())).count();
        long failedCount = documentRepository.findBySourceId(sourceId).stream().filter(d -> "ERROR".equals(d.status())).count();
        long processingCount = documentRepository.findBySourceId(sourceId).stream().filter(d -> "PROCESSING".equals(d.status())).count();
        long chunkCount = chunkRepository.countBySourceId(sourceId);
        long userEditedCount = chunkRepository.countUserEditedBySourceId(sourceId);
        Instant lastIngestion = jobRepository.findAll().stream()
            .filter(j -> sourceId.equals(j.sourceId()) && "SUCCEEDED".equals(j.status()))
            .map(JobRepository.JobRecord::updatedAt)
            .max(Comparator.naturalOrder())
            .orElse(null);
        return new SourceController.SourceStatsResponse(
            sourceId, (int) documentCount, (int) indexedCount, (int) failedCount, (int) processingCount,
            (int) chunkCount, (int) userEditedCount, lastIngestion
        );
    }

    public PageResponse<DocumentController.DocumentSummary> listDocuments(int page, int pageSize, String sourceId) {
        List<DocumentRepository.DocumentRecord> docs = sourceId == null ? documentRepository.findAll() : documentRepository.findBySourceId(sourceId);
        List<DocumentController.DocumentSummary> items = docs.stream().map(this::toDocumentSummary).toList();
        return page(items, page, pageSize);
    }

    public DocumentController.IngestDocumentsResponse ingest(String sourceId, MultipartFile[] files) {
        SourceRepository.SourceRecord source = sourceRepository.findById(sourceId)
            .orElseThrow(() -> new IllegalArgumentException("Source not found: " + sourceId));
        ensureSourceWritable(source);
        Instant now = Instant.now();
        JobRepository.JobRecord job = new JobRepository.JobRecord(Ids.newId("job"), "INGEST", sourceId, null, "RUNNING", 0, null, "Ingest started", "system", 0, 0, 0, 0, null, null, null, now, null, now, now);
        jobRepository.insert(job);
        int imported = 0;
        try {
            for (MultipartFile file : files) {
                if (file.isEmpty() || !StringUtils.hasText(file.getOriginalFilename())) {
                    continue;
                }
                if (processUpload(sourceId, file)) {
                    imported++;
                }
            }
            JobRepository.JobRecord finished = new JobRepository.JobRecord(job.id(), job.jobType(), sourceId, null, "SUCCEEDED", 100, null, "Ingest completed", "system", 0, 0, 0, 0, null, null, null, now, Instant.now(), job.createdAt(), Instant.now());
            jobRepository.update(finished);
            return new DocumentController.IngestDocumentsResponse(job.id(), sourceId, "SUCCEEDED", imported);
        } catch (RuntimeException ex) {
            JobRepository.JobRecord failed = new JobRepository.JobRecord(job.id(), job.jobType(), sourceId, null, "FAILED", imported == 0 ? 0 : 100, null, ex.getMessage(), "system", 0, 0, 0, 0, null, null, ex.getMessage(), now, Instant.now(), job.createdAt(), Instant.now());
            jobRepository.update(failed);
            throw ex;
        }
    }

    public DocumentController.DocumentDetail getDocument(String documentId) {
        return documentRepository.findById(documentId).map(this::toDocumentDetail)
            .orElseThrow(() -> new IllegalArgumentException("Document not found: " + documentId));
    }

    @Transactional
    public DocumentController.DocumentUpdateResponse updateDocument(String documentId, DocumentController.UpdateDocumentRequest request) {
        DocumentRepository.DocumentRecord existing = documentRepository.findById(documentId)
            .orElseThrow(() -> new IllegalArgumentException("Document not found: " + documentId));
        ensureSourceWritable(existing.sourceId());
        DocumentRepository.DocumentRecord updated = new DocumentRepository.DocumentRecord(
            existing.id(), existing.sourceId(), existing.name(), existing.originalFilename(),
            request.title() != null ? request.title() : existing.title(),
            request.description() != null ? request.description() : existing.description(),
            request.tags() != null ? request.tags() : existing.tags(),
            existing.sha256(), existing.contentType(), existing.language(), existing.status(), existing.indexStatus(),
            existing.fileSizeBytes(), existing.chunkCount(), existing.userEditedChunkCount(), existing.errorMessage(),
            "system", existing.createdAt(), Instant.now()
        );
        documentRepository.update(updated);
        return new DocumentController.DocumentUpdateResponse(documentId, true, updated.updatedAt());
    }

    @Transactional
    public DocumentController.DeleteDocumentResponse deleteDocument(String documentId) {
        DocumentRepository.DocumentRecord existing = documentRepository.findById(documentId)
            .orElseThrow(() -> new IllegalArgumentException("Document not found: " + documentId));
        ensureSourceWritable(existing.sourceId());
        lexicalIndexService.deleteDocument(existing.sourceId(), documentId);
        vectorIndexService.deleteDocument(documentId);
        chunkRepository.deleteByDocumentId(documentId);
        documentRepository.delete(documentId);
        storageManager.deleteRecursively(storageManager.artifactDir(existing.sourceId(), existing.id()));
        storageManager.deleteRecursively(storageManager.uploadDocumentDir(existing.sourceId(), existing.id()));
        return new DocumentController.DeleteDocumentResponse(documentId, true);
    }

    public PageResponse<ChunkController.ChunkSummary> listDocumentChunks(String documentId, int page, int pageSize) {
        List<ChunkController.ChunkSummary> items = chunkRepository.findByDocumentId(documentId).stream().map(this::toChunkSummary).toList();
        return page(items, page, pageSize);
    }

    public DocumentController.DocumentPreviewResponse previewDocument(String documentId) {
        DocumentRepository.DocumentRecord document = documentRepository.findById(documentId)
            .orElseThrow(() -> new IllegalArgumentException("Document not found: " + documentId));
        Path artifactDir = storageManager.artifactDir(document.sourceId(), document.id());
        return new DocumentController.DocumentPreviewResponse(
            documentId,
            document.title(),
            storageManager.readString(artifactDir.resolve("content.md"))
        );
    }

    public DocumentController.DocumentArtifactsResponse getArtifacts(String documentId) {
        DocumentRepository.DocumentRecord document = documentRepository.findById(documentId)
            .orElseThrow(() -> new IllegalArgumentException("Document not found: " + documentId));
        Path artifactDir = storageManager.artifactDir(document.sourceId(), document.id());
        return new DocumentController.DocumentArtifactsResponse(
            documentId,
            java.nio.file.Files.exists(artifactDir.resolve("content.md"))
        );
    }

    public String readArtifact(String documentId, String name) {
        DocumentRepository.DocumentRecord document = documentRepository.findById(documentId)
            .orElseThrow(() -> new IllegalArgumentException("Document not found: " + documentId));
        return storageManager.readString(storageManager.artifactDir(document.sourceId(), document.id()).resolve(name));
    }

    public DocumentController.OriginalDocumentResponse originalDocument(String documentId) {
        DocumentRepository.DocumentRecord document = documentRepository.findById(documentId)
            .orElseThrow(() -> new IllegalArgumentException("Document not found: " + documentId));
        Path originalPath = storageManager.originalFilePath(document.sourceId(), document.id(), document.originalFilename());
        return new DocumentController.OriginalDocumentResponse(
            document.id(),
            document.originalFilename(),
            document.contentType(),
            storageManager.readBytes(originalPath)
        );
    }

    public DocumentController.JobCreationResponse simpleDocumentJob(String documentId, String jobType) {
        DocumentRepository.DocumentRecord document = documentRepository.findById(documentId)
            .orElseThrow(() -> new IllegalArgumentException("Document not found: " + documentId));
        ensureSourceWritable(document.sourceId());
        Instant now = Instant.now();
        JobRepository.JobRecord job = new JobRepository.JobRecord(Ids.newId("job"), jobType, document.sourceId(), documentId, "SUCCEEDED", 100, null, jobType + " completed", "system", 0, 0, 0, 0, null, null, null, now, now, now, now);
        jobRepository.insert(job);
        return new DocumentController.JobCreationResponse(job.id(), documentId, jobType, job.status());
    }

    public DocumentController.DocumentStatsResponse documentStats(String documentId) {
        DocumentRepository.DocumentRecord document = documentRepository.findById(documentId)
            .orElseThrow(() -> new IllegalArgumentException("Document not found: " + documentId));
        Instant lastIndexed = jobRepository.findAll().stream()
            .filter(j -> documentId.equals(j.documentId()) && "SUCCEEDED".equals(j.status()))
            .map(JobRepository.JobRecord::updatedAt)
            .max(Comparator.naturalOrder())
            .orElse(document.updatedAt());
        return new DocumentController.DocumentStatsResponse(
            documentId, document.chunkCount(), document.userEditedChunkCount(), lastIndexed, document.status(), document.indexStatus()
        );
    }

    public PageResponse<ChunkController.ChunkSummary> listChunks(int page, int pageSize, String sourceId, String documentId) {
        List<ChunkRepository.ChunkRecord> chunks;
        if (documentId != null) {
            chunks = chunkRepository.findByDocumentId(documentId);
        } else if (sourceId != null) {
            chunks = chunkRepository.findBySourceId(sourceId);
        } else {
            chunks = chunkRepository.findAll();
        }
        List<ChunkController.ChunkSummary> items = chunks.stream().map(this::toChunkSummary).toList();
        return page(items, page, pageSize);
    }

    public ChunkController.ChunkDetail getChunk(String chunkId) {
        return chunkRepository.findById(chunkId).map(this::toChunkDetail)
            .orElseThrow(() -> new IllegalArgumentException("Chunk not found: " + chunkId));
    }

    @Transactional
    public ChunkController.ChunkMutationResponse createChunk(String documentId, ChunkController.CreateChunkRequest request) {
        DocumentRepository.DocumentRecord document = documentRepository.findById(documentId)
            .orElseThrow(() -> new IllegalArgumentException("Document not found: " + documentId));
        ensureSourceWritable(document.sourceId());
        ChunkRepository.ChunkRecord record = new ChunkRepository.ChunkRecord(
            Ids.newId("chk"), documentId, document.sourceId(), request.ordinal(), request.title(), request.titlePath(),
            request.keywords(), request.text(), request.markdown(), request.pageFrom(), request.pageTo(),
            com.huawei.opsfactory.knowledge.common.util.TokenEstimator.estimate(request.text()),
            request.text() == null ? 0 : request.text().length(),
            hash(request.text() + request.markdown()), "USER_EDITED", "system", Instant.now(), Instant.now()
        );
        chunkRepository.insert(record);
        SearchService.SearchableChunk searchableChunk = toSearchableChunk(record);
        Map<String, List<Double>> vectors = embeddingService.ensureChunkEmbeddings(List.of(searchableChunk));
        lexicalIndexService.upsertChunks(List.of(searchableChunk));
        vectorIndexService.upsertChunks(List.of(searchableChunk), vectors);
        refreshDocumentChunkStats(documentId);
        return new ChunkController.ChunkMutationResponse(record.id(), documentId, true, true, record.editStatus(), record.updatedAt());
    }

    @Transactional
    public ChunkController.ChunkMutationResponse updateChunk(String chunkId, ChunkController.UpdateChunkRequest request) {
        ChunkRepository.ChunkRecord existing = chunkRepository.findById(chunkId)
            .orElseThrow(() -> new IllegalArgumentException("Chunk not found: " + chunkId));
        ensureSourceWritable(existing.sourceId());
        String text = request.text() != null ? request.text() : existing.text();
        String markdown = request.markdown() != null ? request.markdown() : existing.markdown();
        ChunkRepository.ChunkRecord updated = new ChunkRepository.ChunkRecord(
            existing.id(), existing.documentId(), existing.sourceId(), existing.ordinal(),
            request.title() != null ? request.title() : existing.title(),
            request.titlePath() != null ? request.titlePath() : existing.titlePath(),
            request.keywords() != null ? request.keywords() : existing.keywords(),
            text,
            markdown,
            request.pageFrom() != null ? request.pageFrom() : existing.pageFrom(),
            request.pageTo() != null ? request.pageTo() : existing.pageTo(),
            com.huawei.opsfactory.knowledge.common.util.TokenEstimator.estimate(text),
            text == null ? 0 : text.length(),
            hash(text + markdown),
            "USER_EDITED",
            "system",
            existing.createdAt(),
            Instant.now()
        );
        chunkRepository.update(updated);
        SearchService.SearchableChunk searchableChunk = toSearchableChunk(updated);
        Map<String, List<Double>> vectors = embeddingService.ensureChunkEmbeddings(List.of(searchableChunk));
        lexicalIndexService.upsertChunks(List.of(searchableChunk));
        vectorIndexService.upsertChunks(List.of(searchableChunk), vectors);
        refreshDocumentChunkStats(existing.documentId());
        return new ChunkController.ChunkMutationResponse(chunkId, existing.documentId(), true, true, updated.editStatus(), updated.updatedAt());
    }

    @Transactional
    public ChunkController.ChunkKeywordsResponse updateChunkKeywords(String chunkId, List<String> keywords) {
        ChunkRepository.ChunkRecord existing = chunkRepository.findById(chunkId)
            .orElseThrow(() -> new IllegalArgumentException("Chunk not found: " + chunkId));
        ensureSourceWritable(existing.sourceId());
        ChunkRepository.ChunkRecord updated = new ChunkRepository.ChunkRecord(
            existing.id(), existing.documentId(), existing.sourceId(), existing.ordinal(), existing.title(),
            existing.titlePath(), keywords, existing.text(), existing.markdown(), existing.pageFrom(), existing.pageTo(),
            existing.tokenCount(), existing.textLength(), hash(existing.text() + existing.markdown() + keywords),
            "USER_EDITED", "system", existing.createdAt(), Instant.now()
        );
        chunkRepository.update(updated);
        SearchService.SearchableChunk searchableChunk = toSearchableChunk(updated);
        Map<String, List<Double>> vectors = embeddingService.ensureChunkEmbeddings(List.of(searchableChunk));
        lexicalIndexService.upsertChunks(List.of(searchableChunk));
        vectorIndexService.upsertChunks(List.of(searchableChunk), vectors);
        refreshDocumentChunkStats(existing.documentId());
        return new ChunkController.ChunkKeywordsResponse(chunkId, keywords, true, true, updated.updatedAt());
    }

    @Transactional
    public ChunkController.DeleteChunkResponse deleteChunk(String chunkId) {
        ChunkRepository.ChunkRecord existing = chunkRepository.findById(chunkId)
            .orElseThrow(() -> new IllegalArgumentException("Chunk not found: " + chunkId));
        ensureSourceWritable(existing.sourceId());
        lexicalIndexService.deleteChunk(existing.sourceId(), chunkId);
        vectorIndexService.deleteChunk(chunkId);
        chunkRepository.delete(chunkId);
        refreshDocumentChunkStats(existing.documentId());
        return new ChunkController.DeleteChunkResponse(chunkId, true);
    }

    @Transactional
    public ChunkController.ReorderChunksResponse reorderChunks(String documentId, List<ChunkController.ReorderItem> items) {
        DocumentRepository.DocumentRecord document = documentRepository.findById(documentId)
            .orElseThrow(() -> new IllegalArgumentException("Document not found: " + documentId));
        ensureSourceWritable(document.sourceId());
        for (ChunkController.ReorderItem item : items) {
            ChunkRepository.ChunkRecord existing = chunkRepository.findById(item.chunkId())
                .orElseThrow(() -> new IllegalArgumentException("Chunk not found: " + item.chunkId()));
            chunkRepository.update(new ChunkRepository.ChunkRecord(
                existing.id(), existing.documentId(), existing.sourceId(), item.ordinal(), existing.title(), existing.titlePath(),
                existing.keywords(), existing.text(), existing.markdown(), existing.pageFrom(), existing.pageTo(),
                existing.tokenCount(), existing.textLength(), existing.contentHash(), "USER_EDITED", "system", existing.createdAt(), Instant.now()
            ));
        }
        refreshDocumentChunkStats(documentId);
        return new ChunkController.ReorderChunksResponse(documentId, true, true, items.size());
    }

    public ChunkController.ChunkReindexResponse reindexChunk(String chunkId) {
        ChunkRepository.ChunkRecord chunk = chunkRepository.findById(chunkId)
            .orElseThrow(() -> new IllegalArgumentException("Chunk not found: " + chunkId));
        ensureSourceWritable(chunk.sourceId());
        SearchService.SearchableChunk searchableChunk = toSearchableChunk(chunk);
        Map<String, List<Double>> vectors = embeddingService.ensureChunkEmbeddings(List.of(searchableChunk));
        lexicalIndexService.upsertChunks(List.of(searchableChunk));
        vectorIndexService.upsertChunks(List.of(searchableChunk), vectors);
        return new ChunkController.ChunkReindexResponse(chunkId, true, Instant.now());
    }

    public RetrievalController.SearchResponse search(RetrievalController.SearchRequest request) {
        ensureSourcesReadable(resolveReferencedSourceIds(request.sourceIds(), request.documentIds()));
        String retrievalProfileId = resolveSearchRetrievalProfileId(request.retrievalProfileId(), request.sourceIds());
        ResolvedRetrievalSettings settings = resolveRetrievalSettings(retrievalProfileId, request.topK(), request.override());
        List<SearchService.SearchableChunk> searchableChunks = filterChunks(request.sourceIds(), request.documentIds(), request.filters());
        List<SearchService.SearchMatch> matches = searchService.search(searchableChunks, request.query(), settings.toSearchOptions());
        List<RetrievalController.SearchHit> hits = toSearchHits(matches, settings.snippetLength());
        return new RetrievalController.SearchResponse(request.query(), hits, hits.size());
    }

    public RetrievalController.CompareSearchResponse compare(RetrievalController.CompareSearchRequest request) {
        ensureSourcesReadable(resolveReferencedSourceIds(request.sourceIds(), request.documentIds()));
        String retrievalProfileId = resolveSearchRetrievalProfileId(request.retrievalProfileId(), request.sourceIds());
        ResolvedRetrievalSettings baseSettings = resolveRetrievalSettings(retrievalProfileId, COMPARE_FETCH_TOP_K, null);
        List<SearchService.SearchableChunk> searchableChunks = filterChunks(request.sourceIds(), request.documentIds(), request.filters());
        List<String> modes = normalizeCompareModes(request.modes());

        RetrievalController.CompareModeResponse hybrid = modes.contains("hybrid")
            ? compareModeResponse(searchableChunks, request.query(), baseSettings.withMode("hybrid", COMPARE_FETCH_TOP_K, null))
            : emptyCompareModeResponse();
        RetrievalController.CompareModeResponse semantic = modes.contains("semantic")
            ? compareModeResponse(searchableChunks, request.query(), baseSettings.withMode("semantic", COMPARE_FETCH_TOP_K, null))
            : emptyCompareModeResponse();
        RetrievalController.CompareModeResponse lexical = modes.contains("lexical")
            ? compareModeResponse(searchableChunks, request.query(), baseSettings.withMode("lexical", COMPARE_FETCH_TOP_K, null))
            : emptyCompareModeResponse();

        return new RetrievalController.CompareSearchResponse(
            request.query(),
            COMPARE_FETCH_TOP_K,
            hybrid,
            semantic,
            lexical
        );
    }

    public RetrievalController.FetchResponse fetch(String chunkId, boolean includeNeighbors, int neighborWindow) {
        if (neighborWindow <= 0 || neighborWindow > profileBootstrapService.properties().getFetch().getMaxNeighborWindow()) {
            throw new IllegalStateException("Invalid neighborWindow: " + neighborWindow);
        }
        ChunkRepository.ChunkRecord chunk = chunkRepository.findById(chunkId)
            .orElseThrow(() -> new IllegalArgumentException("Chunk not found: " + chunkId));
        ensureSourceReadable(chunk.sourceId());
        List<RetrievalController.NeighborChunk> neighbors = null;
        if (includeNeighbors) {
            List<ChunkRepository.ChunkRecord> siblings = chunkRepository.findByDocumentId(chunk.documentId());
            neighbors = siblings.stream()
                .filter(s -> Math.abs(s.ordinal() - chunk.ordinal()) <= neighborWindow && !s.id().equals(chunk.id()))
                .map(s -> new RetrievalController.NeighborChunk(s.ordinal() < chunk.ordinal() ? "previous" : "next", s.id(), s.text()))
                .toList();
        }
        List<ChunkRepository.ChunkRecord> siblings = chunkRepository.findByDocumentId(chunk.documentId());
        String previous = siblings.stream().filter(s -> s.ordinal() == chunk.ordinal() - 1).map(ChunkRepository.ChunkRecord::id).findFirst().orElse(null);
        String next = siblings.stream().filter(s -> s.ordinal() == chunk.ordinal() + 1).map(ChunkRepository.ChunkRecord::id).findFirst().orElse(null);
        return new RetrievalController.FetchResponse(
            chunk.id(), chunk.documentId(), chunk.sourceId(), chunk.title(), chunk.titlePath(), chunk.text(), chunk.markdown(),
            chunk.keywords(), chunk.pageFrom(), chunk.pageTo(), previous, next, neighbors
        );
    }

    public RetrievalController.RetrieveResponse retrieve(RetrievalController.RetrieveRequest request) {
        ensureSourcesReadable(resolveReferencedSourceIds(request.sourceIds(), List.of()));
        RetrievalController.SearchResponse searchResponse = search(new RetrievalController.SearchRequest(
            request.query(), request.sourceIds(), List.of(), request.retrievalProfileId(), request.topK(), null, null
        ));
        List<RetrievalController.Evidence> evidences = searchResponse.hits().stream().map(hit -> {
            RetrievalController.FetchResponse fetched = fetch(hit.chunkId(), false, 1);
            return new RetrievalController.Evidence(
                fetched.chunkId(), fetched.documentId(), fetched.sourceId(), fetched.title(), fetched.text(), fetched.markdown(),
                hit.score(), fetched.keywords(), List.of(new RetrievalController.Reference("page", fetched.pageFrom(), fetched.pageTo()))
            );
        }).toList();
        return new RetrievalController.RetrieveResponse(request.query(), evidences);
    }

    public RetrievalController.ExplainResponse explain(RetrievalController.ExplainRequest request) {
        ChunkRepository.ChunkRecord chunk = chunkRepository.findById(request.chunkId())
            .orElseThrow(() -> new IllegalArgumentException("Chunk not found: " + request.chunkId()));
        ensureSourceReadable(chunk.sourceId());
        String retrievalProfileId = resolveSearchRetrievalProfileId(request.retrievalProfileId(), List.of(chunk.sourceId()));
        ResolvedRetrievalSettings settings = resolveRetrievalSettings(retrievalProfileId, null, null);
        SearchService.ExplainResult explain = searchService.explain(toSearchableChunk(chunk), request.query(), settings.toSearchOptions());
        return new RetrievalController.ExplainResponse(
            request.query(),
            request.chunkId(),
            new RetrievalController.LexicalExplain(explain.matchedFields(), explain.lexicalScore(), 1),
            new RetrievalController.SemanticExplain(explain.semanticScore(), 1),
            new RetrievalController.FusionExplain(explain.fusionMode(), explain.fusionScore())
        );
    }

    private RetrievalController.CompareModeResponse compareModeResponse(
        List<SearchService.SearchableChunk> searchableChunks,
        String query,
        ResolvedRetrievalSettings settings
    ) {
        List<SearchService.SearchMatch> matches = searchService.search(searchableChunks, query, settings.toSearchOptions());
        List<RetrievalController.SearchHit> hits = toSearchHits(matches, settings.snippetLength());
        return new RetrievalController.CompareModeResponse(hits, hits.size());
    }

    private RetrievalController.CompareModeResponse emptyCompareModeResponse() {
        return new RetrievalController.CompareModeResponse(List.of(), 0);
    }

    private List<RetrievalController.SearchHit> toSearchHits(List<SearchService.SearchMatch> matches, int snippetLength) {
        return matches.stream().map(match -> {
            SearchService.SearchableChunk chunk = match.chunk();
            String text = chunk.text() == null ? "" : chunk.text();
            String snippet = text.length() > snippetLength ? text.substring(0, snippetLength) : text;
            return new RetrievalController.SearchHit(
                chunk.id(), chunk.documentId(), chunk.sourceId(), chunk.title(), chunk.titlePath(), snippet,
                match.score(), match.lexicalScore(), match.semanticScore(), match.fusionScore(), chunk.pageFrom(), chunk.pageTo()
            );
        }).toList();
    }

    public PageResponse<ProfileController.ProfileSummary> listIndexProfiles(int page, int pageSize) {
        List<ProfileController.ProfileSummary> items = profileRepository.findAllIndex().stream()
            .map(p -> new ProfileController.ProfileSummary(p.id(), p.name(), p.config(), p.createdAt(), p.updatedAt()))
            .toList();
        return page(items, page, pageSize);
    }

    public PageResponse<ProfileController.ProfileSummary> listRetrievalProfiles(int page, int pageSize) {
        List<ProfileController.ProfileSummary> items = profileRepository.findAllRetrieval().stream()
            .map(p -> new ProfileController.ProfileSummary(p.id(), p.name(), p.config(), p.createdAt(), p.updatedAt()))
            .toList();
        return page(items, page, pageSize);
    }

    @Transactional
    public ProfileController.ProfileDetail createIndexProfile(ProfileController.CreateProfileRequest request) {
        Instant now = Instant.now();
        ProfileRepository.ProfileRecord record = new ProfileRepository.ProfileRecord(Ids.newId("ip"), request.name(), request.config(), "index", now, now);
        profileRepository.insertIndex(record);
        return new ProfileController.ProfileDetail(record.id(), record.name(), record.config(), now, now);
    }

    @Transactional
    public ProfileController.ProfileDetail createRetrievalProfile(ProfileController.CreateProfileRequest request) {
        Instant now = Instant.now();
        ProfileRepository.ProfileRecord record = new ProfileRepository.ProfileRecord(Ids.newId("rp"), request.name(), request.config(), "retrieval", now, now);
        profileRepository.insertRetrieval(record);
        return new ProfileController.ProfileDetail(record.id(), record.name(), record.config(), now, now);
    }

    public ProfileController.ProfileDetail getIndexProfile(String id) {
        ProfileRepository.ProfileRecord record = profileRepository.findIndexById(id).orElseThrow(() -> new IllegalArgumentException("Index profile not found: " + id));
        return new ProfileController.ProfileDetail(record.id(), record.name(), record.config(), record.createdAt(), record.updatedAt());
    }

    public ProfileController.ProfileDetail getRetrievalProfile(String id) {
        ProfileRepository.ProfileRecord record = profileRepository.findRetrievalById(id).orElseThrow(() -> new IllegalArgumentException("Retrieval profile not found: " + id));
        return new ProfileController.ProfileDetail(record.id(), record.name(), record.config(), record.createdAt(), record.updatedAt());
    }

    @Transactional
    public ProfileController.ProfileUpdateResponse updateIndexProfile(String id, ProfileController.UpdateProfileRequest request) {
        ProfileRepository.ProfileRecord existing = profileRepository.findIndexById(id).orElseThrow(() -> new IllegalArgumentException("Index profile not found: " + id));
        ProfileRepository.ProfileRecord updated = new ProfileRepository.ProfileRecord(id, request.name() != null ? request.name() : existing.name(),
            mergeMaps(existing.config(), request.config()), "index", existing.createdAt(), Instant.now());
        profileRepository.updateIndex(updated);
        if (request.config() != null && !request.config().isEmpty()) {
            markSourcesRebuildRequiredByIndexProfile(id);
        }
        return new ProfileController.ProfileUpdateResponse(id, updated.name(), updated.updatedAt());
    }

    @Transactional
    public ProfileController.ProfileUpdateResponse updateRetrievalProfile(String id, ProfileController.UpdateProfileRequest request) {
        ProfileRepository.ProfileRecord existing = profileRepository.findRetrievalById(id).orElseThrow(() -> new IllegalArgumentException("Retrieval profile not found: " + id));
        ProfileRepository.ProfileRecord updated = new ProfileRepository.ProfileRecord(id, request.name() != null ? request.name() : existing.name(),
            mergeMaps(existing.config(), request.config()), "retrieval", existing.createdAt(), Instant.now());
        profileRepository.updateRetrieval(updated);
        return new ProfileController.ProfileUpdateResponse(id, updated.name(), updated.updatedAt());
    }

    @Transactional
    public ProfileController.DeleteProfileResponse deleteIndexProfile(String id) {
        ensureProfileNotBound(id, true);
        profileRepository.deleteIndex(id);
        return new ProfileController.DeleteProfileResponse(id, true);
    }

    @Transactional
    public ProfileController.DeleteProfileResponse deleteRetrievalProfile(String id) {
        ensureProfileNotBound(id, false);
        profileRepository.deleteRetrieval(id);
        return new ProfileController.DeleteProfileResponse(id, true);
    }

    public PageResponse<ProfileController.BindingResponse> listBindings(int page, int pageSize) {
        List<ProfileController.BindingResponse> items = bindingRepository.findAll().stream()
            .map(b -> new ProfileController.BindingResponse(b.sourceId(), b.indexProfileId(), b.retrievalProfileId(), b.updatedAt()))
            .toList();
        return page(items, page, pageSize);
    }

    @Transactional
    public ProfileController.BindingResponse bindProfiles(ProfileController.BindingRequest request) {
        SourceRepository.SourceRecord source = sourceRepository.findById(request.sourceId())
            .orElseThrow(() -> new IllegalArgumentException("Source not found: " + request.sourceId()));
        ensureSourceWritable(source);
        validateIndexProfileExists(request.indexProfileId());
        validateRetrievalProfileExists(request.retrievalProfileId());
        Instant now = Instant.now();
        bindingRepository.upsert(new BindingRepository.BindingRecord(Ids.newId("spb"), request.sourceId(), request.indexProfileId(), request.retrievalProfileId(), now, now));
        sourceRepository.update(new SourceRepository.SourceRecord(
            source.id(), source.name(), source.description(), source.status(), source.storageMode(),
            request.indexProfileId(), request.retrievalProfileId(), source.runtimeStatus(), source.runtimeMessage(),
            source.currentJobId(), source.lastJobError(), source.rebuildRequired() || !request.indexProfileId().equals(source.indexProfileId()),
            source.createdAt(), now
        ));
        return new ProfileController.BindingResponse(request.sourceId(), request.indexProfileId(), request.retrievalProfileId(), now);
    }

    @Transactional
    public SourceController.RebuildSourceResponse rebuildSource(String sourceId) {
        SourceRepository.SourceRecord source = sourceRepository.findById(sourceId)
            .orElseThrow(() -> new IllegalArgumentException("Source not found: " + sourceId));
        if ("MAINTENANCE".equals(source.runtimeStatus())) {
            throw new ApiConflictException("REBUILD_ALREADY_RUNNING", "当前知识库正在重建，请稍后再试");
        }
        Instant now = Instant.now();
        JobRepository.JobRecord job = new JobRepository.JobRecord(
            Ids.newId("job"), "SOURCE_REBUILD", sourceId, null, "RUNNING", 0, "PREPARING", "Source rebuild started",
            "admin", 0, 0, 0, 0, null, null, null, now, null, now, now
        );
        jobRepository.insert(job);
        sourceRepository.update(withRuntimeState(source, "MAINTENANCE", "知识库重建中，请稍后再试", job.id(), source.lastJobError(), source.rebuildRequired(), now));
        taskExecutor.execute(() -> runSourceRebuild(job.id(), sourceId));
        return new SourceController.RebuildSourceResponse(job.id(), sourceId, "RUNNING");
    }

    public SourceController.MaintenanceOverviewResponse maintenanceOverview(String sourceId) {
        sourceRepository.findById(sourceId)
            .orElseThrow(() -> new IllegalArgumentException("Source not found: " + sourceId));
        JobRepository.JobRecord currentJob = jobRepository.findAll().stream()
            .filter(job -> sourceId.equals(job.sourceId()) && "SOURCE_REBUILD".equals(job.jobType()) && "RUNNING".equals(job.status()))
            .findFirst()
            .orElse(null);
        JobRepository.JobRecord lastCompletedJob = jobRepository.findAll().stream()
            .filter(job -> sourceId.equals(job.sourceId()) && "SOURCE_REBUILD".equals(job.jobType()) && job.finishedAt() != null)
            .max(Comparator.comparing(JobRepository.JobRecord::finishedAt))
            .orElse(null);
        return new SourceController.MaintenanceOverviewResponse(
            sourceId,
            toMaintenanceJobSummary(currentJob),
            toMaintenanceJobSummary(lastCompletedJob)
        );
    }

    public ProfileController.BindingResponse updateBinding(String sourceId, ProfileController.BindingPatchRequest request) {
        BindingRepository.BindingRecord existingBinding = bindingRepository.findBySourceId(sourceId)
            .orElseThrow(() -> new IllegalArgumentException("Binding not found for source: " + sourceId));
        return bindProfiles(new ProfileController.BindingRequest(
            sourceId,
            request.indexProfileId() != null ? request.indexProfileId() : existingBinding.indexProfileId(),
            request.retrievalProfileId() != null ? request.retrievalProfileId() : existingBinding.retrievalProfileId()
        ));
    }

    public JobController.JobResponse getJob(String jobId) {
        return jobRepository.findById(jobId).map(this::toJobResponse)
            .orElseThrow(() -> new IllegalArgumentException("Job not found: " + jobId));
    }

    public PageResponse<JobController.JobResponse> listJobs(int page, int pageSize) {
        List<JobController.JobResponse> items = jobRepository.findAll().stream().map(this::toJobResponse).toList();
        return page(items, page, pageSize);
    }

    @Transactional
    public JobController.JobCancelResponse cancelJob(String jobId) {
        JobRepository.JobRecord existing = jobRepository.findById(jobId).orElseThrow(() -> new IllegalArgumentException("Job not found: " + jobId));
        JobRepository.JobRecord updated = new JobRepository.JobRecord(existing.id(), existing.jobType(), existing.sourceId(), existing.documentId(), "CANCELLED", existing.progress(), existing.stage(), existing.message(), existing.createdBy(), existing.totalDocuments(), existing.processedDocuments(), existing.successDocuments(), existing.failedDocuments(), existing.currentDocumentId(), existing.currentDocumentName(), existing.errorSummary(), existing.startedAt(), Instant.now(), existing.createdAt(), Instant.now());
        jobRepository.update(updated);
        return new JobController.JobCancelResponse(jobId, true, "CANCELLED", updated.updatedAt());
    }

    @Transactional
    public JobController.JobRetryResponse retryJob(String jobId) {
        JobRepository.JobRecord existing = jobRepository.findById(jobId).orElseThrow(() -> new IllegalArgumentException("Job not found: " + jobId));
        if (!"FAILED".equals(existing.status())) {
            throw new IllegalStateException("Only failed jobs can be retried");
        }
        Instant now = Instant.now();
        JobRepository.JobRecord retry = new JobRepository.JobRecord(Ids.newId("job"), existing.jobType(), existing.sourceId(), existing.documentId(), "SUCCEEDED", 100, existing.stage(), "Retry completed", "system", existing.totalDocuments(), existing.processedDocuments(), existing.successDocuments(), existing.failedDocuments(), existing.currentDocumentId(), existing.currentDocumentName(), existing.errorSummary(), now, now, now, now);
        jobRepository.insert(retry);
        return new JobController.JobRetryResponse(retry.id(), jobId, retry.status());
    }

    public JobController.JobLogsResponse logs(String jobId) {
        JobController.JobResponse job = getJob(jobId);
        return new JobController.JobLogsResponse(jobId, List.of(new JobController.JobLogEntry(job.updatedAt(), "INFO", job.message())));
    }

    public JobController.JobFailuresResponse jobFailures(String jobId) {
        jobRepository.findById(jobId).orElseThrow(() -> new IllegalArgumentException("Job not found: " + jobId));
        return new JobController.JobFailuresResponse(
            jobId,
            maintenanceJobFailureRepository.findByJobId(jobId).stream()
                .map(failure -> new JobController.JobFailureEntry(
                    failure.documentId(),
                    failure.documentName(),
                    failure.stage(),
                    failure.errorCode(),
                    failure.message(),
                    failure.finishedAt()
                ))
                .toList()
        );
    }

    public com.huawei.opsfactory.knowledge.api.stats.StatsController.OverviewStatsResponse overviewStats() {
        return new com.huawei.opsfactory.knowledge.api.stats.StatsController.OverviewStatsResponse(
            sourceRepository.findAll().size(),
            (int) documentRepository.count(),
            (int) documentRepository.countByStatus("INDEXED"),
            (int) documentRepository.countByStatus("ERROR"),
            (int) documentRepository.countByStatus("PROCESSING"),
            (int) chunkRepository.count(),
            (int) chunkRepository.countUserEdited(),
            (int) jobRepository.countRunning()
        );
    }

    private boolean processUpload(String sourceId, MultipartFile file) {
        try {
            String documentId = Ids.newId("doc");
            String sha256 = sha256(file.getInputStream());
            if (documentRepository.findBySourceIdAndSha256(sourceId, sha256).isPresent()) {
                return false;
            }
            Path originalPath = storageManager.originalFilePath(sourceId, documentId, file.getOriginalFilename());
            storageManager.save(file.getInputStream(), originalPath);
            TikaConversionService.ConversionResult conversion = conversionService.convert(originalPath);
            if (!isAllowedContentType(Optional.ofNullable(file.getContentType()).orElse(conversion.contentType()), conversion.contentType())) {
                storageManager.deleteRecursively(storageManager.uploadDocumentDir(sourceId, documentId));
                throw new IllegalStateException("Unsupported content type: " + conversion.contentType());
            }
            Instant now = Instant.now();
            DocumentRepository.DocumentRecord doc = new DocumentRepository.DocumentRecord(
                documentId, sourceId, file.getOriginalFilename(), file.getOriginalFilename(), conversion.title(), null, List.of(),
                sha256, Optional.ofNullable(file.getContentType()).orElse(conversion.contentType()), "zh",
                "INDEXED", "INDEXED", file.getSize(), 0, 0, null, "system", now, now
            );
            documentRepository.insert(doc);
            Path artifactDir = storageManager.artifactDir(sourceId, documentId);
            storageManager.writeString(artifactDir.resolve("content.md"), conversion.markdown());
            List<ChunkingService.ChunkDraft> chunks = chunkingService.chunk(conversion.title(), conversion.text(), conversion.markdown());
            List<SearchService.SearchableChunk> insertedChunks = new ArrayList<>();
            for (ChunkingService.ChunkDraft draft : chunks) {
                ChunkRepository.ChunkRecord chunkRecord = new ChunkRepository.ChunkRecord(
                    Ids.newId("chk"), documentId, sourceId, draft.ordinal(), draft.title(), draft.titlePath(), draft.keywords(),
                    draft.text(), draft.markdown(), 1, 1, draft.tokenCount(), draft.textLength(), hash(draft.text() + draft.markdown()),
                    "SYSTEM_GENERATED", "system", now, now
                );
                chunkRepository.insert(chunkRecord);
                insertedChunks.add(toSearchableChunk(chunkRecord));
            }
            Map<String, List<Double>> vectors = embeddingService.ensureChunkEmbeddings(insertedChunks);
            lexicalIndexService.upsertChunks(insertedChunks);
            vectorIndexService.upsertChunks(insertedChunks, vectors);
            refreshDocumentChunkStats(documentId);
            return true;
        } catch (Exception e) {
            throw new IllegalStateException("Failed to ingest file " + file.getOriginalFilename(), e);
        }
    }

    private boolean isAllowedContentType(String requestContentType, String detectedContentType) {
        List<String> allowed = profileBootstrapService.allowedContentTypes();
        return allowed.contains(requestContentType) || allowed.contains(detectedContentType);
    }

    private void validateIndexProfileExists(String profileId) {
        if (profileId != null && profileRepository.findIndexById(profileId).isEmpty()) {
            throw new IllegalArgumentException("Index profile not found: " + profileId);
        }
    }

    private void validateRetrievalProfileExists(String profileId) {
        if (profileId != null && profileRepository.findRetrievalById(profileId).isEmpty()) {
            throw new IllegalArgumentException("Retrieval profile not found: " + profileId);
        }
    }

    private void ensureProfileNotBound(String profileId, boolean indexProfile) {
        boolean inUse = bindingRepository.findAll().stream().anyMatch(binding ->
            indexProfile ? profileId.equals(binding.indexProfileId()) : profileId.equals(binding.retrievalProfileId())
        );
        if (inUse) {
            throw new IllegalStateException("Profile is still bound to a source: " + profileId);
        }
    }

    private void refreshDocumentChunkStats(String documentId) {
        DocumentRepository.DocumentRecord existing = documentRepository.findById(documentId)
            .orElseThrow(() -> new IllegalArgumentException("Document not found: " + documentId));
        List<ChunkRepository.ChunkRecord> chunks = chunkRepository.findByDocumentId(documentId);
        int userEdited = (int) chunks.stream().filter(c -> "USER_EDITED".equals(c.editStatus())).count();
        documentRepository.update(new DocumentRepository.DocumentRecord(
            existing.id(), existing.sourceId(), existing.name(), existing.originalFilename(), existing.title(), existing.description(),
            existing.tags(), existing.sha256(), existing.contentType(), existing.language(), "INDEXED", "INDEXED",
            existing.fileSizeBytes(), chunks.size(), userEdited, existing.errorMessage(), existing.updatedBy(), existing.createdAt(), Instant.now()
        ));
    }

    private String sha256(InputStream inputStream) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[8192];
            int read;
            while ((read = inputStream.read(buffer)) >= 0) {
                digest.update(buffer, 0, read);
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (Exception e) {
            throw new IllegalStateException("Failed to calculate sha256", e);
        }
    }

    private String hash(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest((value == null ? "" : value).getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private List<SearchService.SearchableChunk> filterChunks(
        List<String> sourceIds,
        List<String> documentIds,
        RetrievalController.SearchFilters filters
    ) {
        return chunkRepository.findAll().stream()
            .filter(c -> sourceIds == null || sourceIds.isEmpty() || sourceIds.contains(c.sourceId()))
            .filter(c -> documentIds == null || documentIds.isEmpty() || documentIds.contains(c.documentId()))
            .filter(c -> {
                if (filters == null || filters.contentTypes() == null || filters.contentTypes().isEmpty()) {
                    return true;
                }
                return documentRepository.findById(c.documentId())
                    .map(DocumentRepository.DocumentRecord::contentType)
                    .filter(filters.contentTypes()::contains)
                    .isPresent();
            })
            .map(this::toSearchableChunk)
            .toList();
    }

    private SearchService.SearchableChunk toSearchableChunk(ChunkRepository.ChunkRecord record) {
        return new SearchService.SearchableChunk(
            record.id(), record.documentId(), record.sourceId(), record.title(), record.titlePath(),
            record.keywords(), record.text(), record.markdown(), record.pageFrom(), record.pageTo(),
            record.ordinal(), record.editStatus(), record.updatedBy()
        );
    }

    private void ensureSourceWritable(String sourceId) {
        SourceRepository.SourceRecord source = sourceRepository.findById(sourceId)
            .orElseThrow(() -> new IllegalArgumentException("Source not found: " + sourceId));
        ensureSourceWritable(source);
    }

    private void ensureSourceWritable(SourceRepository.SourceRecord source) {
        if ("MAINTENANCE".equals(source.runtimeStatus())) {
            throw new ApiConflictException("SOURCE_IN_MAINTENANCE", "当前知识库正在重建，暂不可执行该操作");
        }
        if ("ERROR".equals(source.runtimeStatus())) {
            throw new ApiConflictException("SOURCE_UNAVAILABLE", "当前知识库处于异常状态，请重新触发重建");
        }
    }

    private void ensureSourceReadable(String sourceId) {
        SourceRepository.SourceRecord source = sourceRepository.findById(sourceId)
            .orElseThrow(() -> new IllegalArgumentException("Source not found: " + sourceId));
        if ("MAINTENANCE".equals(source.runtimeStatus())) {
            throw new ApiConflictException("SOURCE_IN_MAINTENANCE", "当前知识库正在重建，暂不可执行该操作");
        }
        if ("ERROR".equals(source.runtimeStatus())) {
            throw new ApiConflictException("SOURCE_UNAVAILABLE", "当前知识库处于异常状态，请重新触发重建");
        }
    }

    private void ensureSourcesReadable(Set<String> sourceIds) {
        for (String sourceId : sourceIds) {
            ensureSourceReadable(sourceId);
        }
    }

    private Set<String> resolveReferencedSourceIds(List<String> sourceIds, List<String> documentIds) {
        LinkedHashSet<String> resolved = new LinkedHashSet<>();
        if (sourceIds != null) {
            resolved.addAll(sourceIds.stream().filter(StringUtils::hasText).toList());
        }
        if (documentIds != null) {
            documentIds.stream()
                .filter(StringUtils::hasText)
                .map(documentRepository::findById)
                .flatMap(Optional::stream)
                .map(DocumentRepository.DocumentRecord::sourceId)
                .forEach(resolved::add);
        }
        return resolved;
    }

    private SourceRepository.SourceRecord withRuntimeState(
        SourceRepository.SourceRecord source,
        String runtimeStatus,
        String runtimeMessage,
        String currentJobId,
        String lastJobError,
        boolean rebuildRequired,
        Instant updatedAt
    ) {
        return new SourceRepository.SourceRecord(
            source.id(), source.name(), source.description(), source.status(), source.storageMode(),
            source.indexProfileId(), source.retrievalProfileId(), runtimeStatus, runtimeMessage, currentJobId,
            lastJobError, rebuildRequired, source.createdAt(), updatedAt
        );
    }

    private void markSourcesRebuildRequiredByIndexProfile(String profileId) {
        Instant now = Instant.now();
        bindingRepository.findAll().stream()
            .filter(binding -> profileId.equals(binding.indexProfileId()))
            .map(BindingRepository.BindingRecord::sourceId)
            .map(sourceRepository::findById)
            .flatMap(Optional::stream)
            .forEach(source -> sourceRepository.update(withRuntimeState(
                source,
                source.runtimeStatus(),
                source.runtimeMessage(),
                source.currentJobId(),
                source.lastJobError(),
                true,
                now
            )));
    }

    private void runSourceRebuild(String jobId, String sourceId) {
        Instant startedAt = Instant.now();
        try {
            SourceRepository.SourceRecord source = sourceRepository.findById(sourceId)
                .orElseThrow(() -> new IllegalArgumentException("Source not found: " + sourceId));
            List<DocumentRepository.DocumentRecord> documents = documentRepository.findBySourceId(sourceId);
            maintenanceJobFailureRepository.deleteByJobId(jobId);

            updateRebuildJob(jobId, sourceId, "RUNNING", "PREPARING", "Source rebuild started", documents.size(), 0, 0, 0, null, null, null, startedAt, null);

            updateRebuildJob(jobId, sourceId, "RUNNING", "CLEANING", "Cleaning existing chunks and indexes", documents.size(), 0, 0, 0, null, null, null, startedAt, null);
            lexicalIndexService.deleteSource(sourceId);
            vectorIndexService.deleteSource(sourceId);
            chunkRepository.deleteBySourceId(sourceId);
            storageManager.deleteRecursively(storageManager.artifactSourceDir(sourceId));

            int total = documents.size();
            int processed = 0;
            int succeededCount = 0;
            int failedCount = 0;
            for (DocumentRepository.DocumentRecord document : documents) {
                final String[] stageHolder = { "PARSING" };
                final int processedBeforeDocument = processed;
                final int succeededBeforeDocument = succeededCount;
                final int failedBeforeDocument = failedCount;
                try {
                    updateRebuildJob(jobId, sourceId, "RUNNING", stageHolder[0], "Parsing document", total, processedBeforeDocument, succeededBeforeDocument, failedBeforeDocument, document.id(), document.name(), null, startedAt, null);
                    rebuildDocumentFromOriginal(document, currentStage -> {
                        stageHolder[0] = currentStage;
                        updateRebuildJob(
                        jobId,
                        sourceId,
                        "RUNNING",
                        currentStage,
                        stageMessage(currentStage),
                        total,
                        processedBeforeDocument,
                        succeededBeforeDocument,
                        failedBeforeDocument,
                        document.id(),
                        document.name(),
                        null,
                        startedAt,
                        null
                    );
                    });
                    succeededCount++;
                } catch (Exception ex) {
                    failedCount++;
                    maintenanceJobFailureRepository.insert(new MaintenanceJobFailureRepository.FailureRecord(
                        Ids.newId("mjf"),
                        jobId,
                        sourceId,
                        document.id(),
                        document.name(),
                        stageHolder[0],
                        errorCodeFromException(ex),
                        summarizeError(ex),
                        Instant.now()
                    ));
                }
                processed++;
                updateRebuildJob(jobId, sourceId, "RUNNING", processed == total ? "INDEXING" : "PARSING", "Rebuilt " + processed + "/" + total + " documents", total, processed, succeededCount, failedCount, null, null, failedCount > 0 ? failedCount + " 个文档处理失败" : null, startedAt, null);
            }
            Instant now = Instant.now();
            final int finalFailedCount = failedCount;
            final int finalSucceededCount = succeededCount;
            JobRepository.JobRecord succeeded = new JobRepository.JobRecord(
                jobId, "SOURCE_REBUILD", sourceId, null, finalFailedCount > 0 ? "FAILED" : "SUCCEEDED", 100, "COMPLETED",
                finalFailedCount > 0 ? "Source rebuild completed with failures" : "Source rebuild completed",
                "admin", total, total, finalSucceededCount, finalFailedCount, null, null,
                finalFailedCount > 0 ? finalFailedCount + " 个文档处理失败" : null, startedAt, now, startedAt, now
            );
            jobRepository.update(succeeded);
            sourceRepository.findById(sourceId).ifPresent(current -> sourceRepository.update(withRuntimeState(
                current,
                finalFailedCount > 0 ? "ERROR" : "ACTIVE",
                finalFailedCount > 0 ? "知识库重建失败，请重新触发重建" : null,
                null,
                finalFailedCount > 0 ? finalFailedCount + " 个文档处理失败" : null,
                finalFailedCount > 0,
                now
            )));
        } catch (Exception ex) {
            Instant now = Instant.now();
            jobRepository.update(new JobRepository.JobRecord(
                jobId, "SOURCE_REBUILD", sourceId, null, "FAILED", 0, "COMPLETED", ex.getMessage(),
                "admin", 0, 0, 0, 0, null, null, summarizeError(ex), startedAt, now, startedAt, now
            ));
            sourceRepository.findById(sourceId).ifPresent(current -> sourceRepository.update(withRuntimeState(
                current,
                "ERROR",
                "知识库重建失败，请重新触发重建",
                null,
                summarizeError(ex),
                true,
                now
            )));
        }
    }

    private void rebuildDocumentFromOriginal(DocumentRepository.DocumentRecord document, java.util.function.Consumer<String> stageCallback) {
        Path originalPath = storageManager.originalFilePath(document.sourceId(), document.id(), document.originalFilename());
        stageCallback.accept("PARSING");
        TikaConversionService.ConversionResult conversion = conversionService.convert(originalPath);
        Path artifactDir = storageManager.artifactDir(document.sourceId(), document.id());
        storageManager.writeString(artifactDir.resolve("content.md"), conversion.markdown());

        Instant now = Instant.now();
        DocumentRepository.DocumentRecord updatedDocument = new DocumentRepository.DocumentRecord(
            document.id(), document.sourceId(), document.name(), document.originalFilename(),
            conversion.title(), document.description(), document.tags(), document.sha256(),
            document.contentType(), document.language(), "INDEXED", "INDEXED", document.fileSizeBytes(), 0, 0,
            null, "system", document.createdAt(), now
        );
        documentRepository.update(updatedDocument);

        stageCallback.accept("CHUNKING");
        List<ChunkingService.ChunkDraft> chunks = chunkingService.chunk(conversion.title(), conversion.text(), conversion.markdown());
        List<SearchService.SearchableChunk> insertedChunks = new ArrayList<>();
        for (ChunkingService.ChunkDraft draft : chunks) {
            ChunkRepository.ChunkRecord chunkRecord = new ChunkRepository.ChunkRecord(
                Ids.newId("chk"), document.id(), document.sourceId(), draft.ordinal(), draft.title(), draft.titlePath(), draft.keywords(),
                draft.text(), draft.markdown(), 1, 1, draft.tokenCount(), draft.textLength(), hash(draft.text() + draft.markdown()),
                "SYSTEM_GENERATED", "system", now, now
            );
            chunkRepository.insert(chunkRecord);
            insertedChunks.add(toSearchableChunk(chunkRecord));
        }
        stageCallback.accept("INDEXING");
        Map<String, List<Double>> vectors = embeddingService.ensureChunkEmbeddings(insertedChunks);
        lexicalIndexService.upsertChunks(insertedChunks);
        vectorIndexService.upsertChunks(insertedChunks, vectors);
        refreshDocumentChunkStats(document.id());
    }

    private void updateRebuildJob(
        String jobId,
        String sourceId,
        String status,
        String stage,
        String message,
        int totalDocuments,
        int processedDocuments,
        int successDocuments,
        int failedDocuments,
        String currentDocumentId,
        String currentDocumentName,
        String errorSummary,
        Instant startedAt,
        Instant finishedAt
    ) {
        int progress = totalDocuments == 0 ? ("COMPLETED".equals(stage) ? 100 : 0) : Math.min(99, (processedDocuments * 100) / totalDocuments);
        if (finishedAt != null) {
            progress = 100;
        }
        jobRepository.update(new JobRepository.JobRecord(
            jobId,
            "SOURCE_REBUILD",
            sourceId,
            null,
            status,
            progress,
            stage,
            message,
            "admin",
            totalDocuments,
            processedDocuments,
            successDocuments,
            failedDocuments,
            currentDocumentId,
            currentDocumentName,
            errorSummary,
            startedAt,
            finishedAt,
            startedAt,
            Instant.now()
        ));
    }

    private String stageMessage(String stage) {
        return switch (stage) {
        case "CLEANING" -> "Cleaning existing chunks and indexes";
        case "PARSING" -> "Parsing document";
        case "CHUNKING" -> "Rebuilding chunks";
        case "INDEXING" -> "Rebuilding indexes";
        case "COMPLETED" -> "Source rebuild completed";
        default -> "Preparing source rebuild";
        };
    }

    private String summarizeError(Exception ex) {
        Throwable current = ex;
        while (current.getCause() != null) {
            current = current.getCause();
        }
        return StringUtils.hasText(current.getMessage()) ? current.getMessage() : ex.getClass().getSimpleName();
    }

    private String errorCodeFromException(Exception ex) {
        String message = summarizeError(ex).toLowerCase();
        if (message.contains("parse") || message.contains("convert")) {
            return "DOCUMENT_PARSE_FAILED";
        }
        if (message.contains("chunk")) {
            return "CHUNK_BUILD_FAILED";
        }
        if (message.contains("index")) {
            return "INDEX_WRITE_FAILED";
        }
        if (message.contains("embed")) {
            return "EMBEDDING_FAILED";
        }
        return "REBUILD_DOCUMENT_FAILED";
    }

    private SourceController.SourceResponse toSourceResponse(SourceRepository.SourceRecord source) {
        return new SourceController.SourceResponse(
            source.id(), source.name(), source.description(), source.status(), source.storageMode(),
            source.indexProfileId(), source.retrievalProfileId(), source.runtimeStatus(), source.runtimeMessage(),
            source.currentJobId(), source.lastJobError(), source.rebuildRequired(), source.createdAt(), source.updatedAt()
        );
    }

    private DocumentController.DocumentSummary toDocumentSummary(DocumentRepository.DocumentRecord document) {
        return new DocumentController.DocumentSummary(
            document.id(), document.sourceId(), document.name(), document.contentType(), document.title(), document.status(),
            document.indexStatus(), document.fileSizeBytes(), document.chunkCount(), document.userEditedChunkCount(),
            document.createdAt(), document.updatedAt()
        );
    }

    private DocumentController.DocumentDetail toDocumentDetail(DocumentRepository.DocumentRecord document) {
        return new DocumentController.DocumentDetail(
            document.id(), document.sourceId(), document.name(), document.originalFilename(), document.title(), document.description(),
            document.tags(), document.sha256(), document.contentType(), document.language(), document.status(), document.indexStatus(),
            document.fileSizeBytes(), document.chunkCount(), document.userEditedChunkCount(), document.errorMessage(),
            document.createdAt(), document.updatedAt()
        );
    }

    private ChunkController.ChunkSummary toChunkSummary(ChunkRepository.ChunkRecord chunk) {
        String snippet = chunk.text().length() > 180 ? chunk.text().substring(0, 180) : chunk.text();
        return new ChunkController.ChunkSummary(
            chunk.id(), chunk.documentId(), chunk.sourceId(), chunk.ordinal(), chunk.title(), chunk.titlePath(),
            chunk.keywords(), snippet, chunk.pageFrom(), chunk.pageTo(), chunk.tokenCount(), chunk.editStatus(), chunk.updatedAt()
        );
    }

    private ChunkController.ChunkDetail toChunkDetail(ChunkRepository.ChunkRecord chunk) {
        return new ChunkController.ChunkDetail(
            chunk.id(), chunk.documentId(), chunk.sourceId(), chunk.ordinal(), chunk.title(), chunk.titlePath(), chunk.keywords(),
            chunk.text(), chunk.markdown(), chunk.pageFrom(), chunk.pageTo(), chunk.tokenCount(), chunk.textLength(),
            chunk.editStatus(), chunk.updatedBy(), chunk.createdAt(), chunk.updatedAt()
        );
    }

    private JobController.JobResponse toJobResponse(JobRepository.JobRecord job) {
        return new JobController.JobResponse(
            job.id(), job.jobType(), job.sourceId(), job.documentId(), job.status(), job.progress(), job.stage(), job.message(),
            job.createdBy(), job.totalDocuments(), job.processedDocuments(), job.successDocuments(), job.failedDocuments(),
            job.currentDocumentId(), job.currentDocumentName(), job.errorSummary(),
            job.startedAt(), job.finishedAt(), job.createdAt(), job.updatedAt()
        );
    }

    private SourceController.MaintenanceJobSummary toMaintenanceJobSummary(JobRepository.JobRecord job) {
        if (job == null) {
            return null;
        }
        return new SourceController.MaintenanceJobSummary(
            job.id(),
            job.jobType(),
            job.status(),
            job.stage(),
            job.createdBy(),
            job.startedAt(),
            job.updatedAt(),
            job.finishedAt(),
            job.totalDocuments(),
            job.processedDocuments(),
            job.successDocuments(),
            job.failedDocuments(),
            job.currentDocumentId(),
            job.currentDocumentName(),
            job.message(),
            job.errorSummary()
        );
    }

    private Map<String, Object> mergeMaps(Map<String, Object> base, Map<String, Object> patch) {
        if (patch == null || patch.isEmpty()) {
            return base;
        }
        Map<String, Object> merged = new java.util.LinkedHashMap<>(base);
        merged.putAll(patch);
        return merged;
    }

    private ResolvedRetrievalSettings resolveRetrievalSettings(
        String retrievalProfileId,
        Integer requestTopK,
        RetrievalController.SearchOverride override
    ) {
        KnowledgeProperties.Retrieval defaults = profileBootstrapService.properties().getRetrieval();
        Map<String, Object> profileConfig = retrievalProfileId == null
            ? Map.of()
            : profileRepository.findRetrievalById(retrievalProfileId).map(ProfileRepository.ProfileRecord::config).orElse(Map.of());

        String mode = firstNonBlank(
            override != null ? override.mode() : null,
            nestedString(profileConfig, "retrieval", "mode"),
            defaults.getMode()
        );
        int finalTopK = requestTopK != null
            ? requestTopK
            : nestedInt(profileConfig, "result", "finalTopK").orElse(defaults.getFinalTopK());
        if (finalTopK <= 0 || finalTopK > defaults.getMaxTopK()) {
            throw new IllegalStateException("Invalid topK: " + finalTopK);
        }

        int lexicalTopK = override != null && override.lexicalTopK() != null
            ? override.lexicalTopK()
            : nestedInt(profileConfig, "retrieval", "lexicalTopK").orElse(defaults.getLexicalTopK());
        int semanticTopK = override != null && override.semanticTopK() != null
            ? override.semanticTopK()
            : nestedInt(profileConfig, "retrieval", "semanticTopK").orElse(defaults.getSemanticTopK());
        int rrfK = override != null && override.rrfK() != null
            ? override.rrfK()
            : nestedInt(profileConfig, "retrieval", "rrfK").orElse(defaults.getRrfK());
        Double scoreThreshold = override != null ? override.scoreThreshold() : null;
        int snippetLength = override != null && override.snippetLength() != null
            ? override.snippetLength()
            : nestedInt(profileConfig, "result", "snippetLength").orElse(defaults.getSnippetLength());

        return new ResolvedRetrievalSettings(
            mode == null ? "hybrid" : mode,
            Math.max(lexicalTopK, finalTopK),
            Math.max(semanticTopK, finalTopK),
            finalTopK,
            Math.max(rrfK, 1),
            scoreThreshold != null ? clamp(scoreThreshold) : null,
            Math.max(snippetLength, 1)
        );
    }

    private String resolveSearchRetrievalProfileId(String explicitRetrievalProfileId, List<String> sourceIds) {
        if (explicitRetrievalProfileId != null && !explicitRetrievalProfileId.isBlank()) {
            return explicitRetrievalProfileId;
        }
        if (sourceIds != null && sourceIds.size() == 1) {
            return sourceRepository.findById(sourceIds.get(0))
                .map(SourceRepository.SourceRecord::retrievalProfileId)
                .orElse(profileBootstrapService.defaultRetrievalProfileId());
        }
        return profileBootstrapService.defaultRetrievalProfileId();
    }

    private List<String> normalizeCompareModes(List<String> modes) {
        List<String> normalized = modes == null
            ? List.of()
            : modes.stream()
                .filter(StringUtils::hasText)
                .map(String::trim)
                .map(String::toLowerCase)
                .filter(mode -> mode.equals("hybrid") || mode.equals("semantic") || mode.equals("lexical"))
                .distinct()
                .toList();
        if (!normalized.isEmpty()) {
            return normalized;
        }
        return List.of("hybrid", "semantic", "lexical");
    }

    private Optional<Integer> nestedInt(Map<String, Object> root, String parentKey, String key) {
        Object value = nestedValue(root, parentKey, key);
        if (value instanceof Number number) {
            return Optional.of(number.intValue());
        }
        return Optional.empty();
    }

    private Optional<Double> nestedDouble(Map<String, Object> root, String parentKey, String key) {
        Object value = nestedValue(root, parentKey, key);
        if (value instanceof Number number) {
            return Optional.of(number.doubleValue());
        }
        return Optional.empty();
    }

    private String nestedString(Map<String, Object> root, String parentKey, String key) {
        Object value = nestedValue(root, parentKey, key);
        return value instanceof String string && StringUtils.hasText(string) ? string : null;
    }

    @SuppressWarnings("unchecked")
    private Object nestedValue(Map<String, Object> root, String parentKey, String key) {
        if (root == null || root.isEmpty()) {
            return null;
        }
        Object nested = root.get(parentKey);
        if (!(nested instanceof Map<?, ?> nestedMap)) {
            return null;
        }
        return ((Map<String, Object>) nestedMap).get(key);
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value;
            }
        }
        return null;
    }

    private double clamp(double value) {
        return Math.max(0, Math.min(1, value));
    }

    private <T> PageResponse<T> page(List<T> items, int page, int pageSize) {
        int safePage = Math.max(page, 1);
        int safePageSize = Math.max(pageSize, 1);
        int from = Math.min((safePage - 1) * safePageSize, items.size());
        int to = Math.min(from + safePageSize, items.size());
        return new PageResponse<>(items.subList(from, to), safePage, safePageSize, items.size());
    }

    private record ResolvedRetrievalSettings(
        String mode,
        int lexicalTopK,
        int semanticTopK,
        int finalTopK,
        int rrfK,
        Double scoreThreshold,
        int snippetLength
    ) {
        private SearchService.SearchOptions toSearchOptions() {
            return new SearchService.SearchOptions(
                mode,
                lexicalTopK,
                semanticTopK,
                finalTopK,
                rrfK,
                scoreThreshold
            );
        }

        private ResolvedRetrievalSettings withMode(String nextMode, int nextFinalTopK, Double nextScoreThreshold) {
            return new ResolvedRetrievalSettings(
                nextMode,
                Math.max(lexicalTopK, nextFinalTopK),
                Math.max(semanticTopK, nextFinalTopK),
                nextFinalTopK,
                rrfK,
                nextScoreThreshold,
                snippetLength
            );
        }
    }
}
