package com.huawei.opsfactory.knowledge.service;

import com.huawei.opsfactory.knowledge.config.KnowledgeProperties;
import com.huawei.opsfactory.knowledge.repository.ProfileRepository;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class ProfileBootstrapService {

    private static final Logger log = LoggerFactory.getLogger(ProfileBootstrapService.class);

    public static final String DEFAULT_INDEX_PROFILE_NAME = "system-default-index";
    public static final String DEFAULT_RETRIEVAL_PROFILE_NAME = "system-default-retrieval";

    private final ProfileRepository profileRepository;
    private final KnowledgeProperties properties;

    public ProfileBootstrapService(ProfileRepository profileRepository, KnowledgeProperties properties) {
        this.profileRepository = profileRepository;
        this.properties = properties;
        ensureDefaults();
    }

    public String defaultIndexProfileId() {
        return profileRepository.findIndexByName(DEFAULT_INDEX_PROFILE_NAME).map(ProfileRepository.ProfileRecord::id).orElse(null);
    }

    public String defaultRetrievalProfileId() {
        return profileRepository.findRetrievalByName(DEFAULT_RETRIEVAL_PROFILE_NAME).map(ProfileRepository.ProfileRecord::id).orElse(null);
    }

    public List<String> allowedContentTypes() {
        return properties.getIngest().getAllowedContentTypes();
    }

    public KnowledgeProperties properties() {
        return properties;
    }

    private void ensureDefaults() {
        Instant now = Instant.now();
        Map<String, Object> defaultRetrievalConfig = defaultRetrievalConfig();
        profileRepository.findIndexByName(DEFAULT_INDEX_PROFILE_NAME).orElseGet(() -> {
            ProfileRepository.ProfileRecord record = new ProfileRepository.ProfileRecord(
                com.huawei.opsfactory.knowledge.common.util.Ids.newId("ip"),
                DEFAULT_INDEX_PROFILE_NAME,
                defaultIndexConfig(),
                "index",
                now,
                now
            );
            profileRepository.insertIndex(record);
            log.info("Created default index profile name={} id={}", record.name(), record.id());
            return record;
        });
        profileRepository.findRetrievalByName(DEFAULT_RETRIEVAL_PROFILE_NAME).map(existing -> {
            ProfileRepository.ProfileRecord updated = new ProfileRepository.ProfileRecord(
                existing.id(),
                existing.name(),
                defaultRetrievalConfig,
                existing.type(),
                existing.createdAt(),
                now
            );
            profileRepository.updateRetrieval(updated);
            log.debug("Refreshed default retrieval profile name={} id={}", updated.name(), updated.id());
            return updated;
        }).orElseGet(() -> {
            ProfileRepository.ProfileRecord record = new ProfileRepository.ProfileRecord(
                com.huawei.opsfactory.knowledge.common.util.Ids.newId("rp"),
                DEFAULT_RETRIEVAL_PROFILE_NAME,
                defaultRetrievalConfig,
                "retrieval",
                now,
                now
            );
            profileRepository.insertRetrieval(record);
            log.info("Created default retrieval profile name={} id={}", record.name(), record.id());
            return record;
        });
    }

    private Map<String, Object> defaultIndexConfig() {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("convert", Map.of(
            "engine", properties.getConvert().getEngine(),
            "enablePdfboxFallback", properties.getConvert().isEnablePdfboxFallback()
        ));
        root.put("analysis", Map.of(
            "language", properties.getAnalysis().getLanguage(),
            "indexAnalyzer", properties.getAnalysis().getIndexAnalyzer(),
            "queryAnalyzer", properties.getAnalysis().getQueryAnalyzer()
        ));
        root.put("chunking", Map.of(
            "mode", properties.getChunking().getMode(),
            "targetTokens", properties.getChunking().getTargetTokens(),
            "overlapTokens", properties.getChunking().getOverlapTokens()
        ));
        root.put("embedding", Map.of(
            "enabled", true,
            "model", properties.getEmbedding().getModel(),
            "dimensions", properties.getEmbedding().getDimensions()
        ));
        root.put("indexing", Map.of(
            "titleBoost", properties.getIndexing().getTitleBoost(),
            "titlePathBoost", properties.getIndexing().getTitlePathBoost(),
            "keywordBoost", properties.getIndexing().getKeywordBoost(),
            "contentBoost", properties.getIndexing().getContentBoost(),
            "bm25", Map.of(
                "k1", properties.getIndexing().getBm25().getK1(),
                "b", properties.getIndexing().getBm25().getB()
            )
        ));
        return root;
    }

    private Map<String, Object> defaultRetrievalConfig() {
        return Map.of(
            "retrieval", Map.of(
                "mode", properties.getRetrieval().getMode(),
                "lexicalTopK", properties.getRetrieval().getLexicalTopK(),
                "semanticTopK", properties.getRetrieval().getSemanticTopK(),
                "rrfK", properties.getRetrieval().getRrfK(),
                "strategy", "rrf"
            ),
            "result", Map.of(
                "finalTopK", properties.getRetrieval().getFinalTopK(),
                "snippetLength", properties.getRetrieval().getSnippetLength()
            )
        );
    }
}
