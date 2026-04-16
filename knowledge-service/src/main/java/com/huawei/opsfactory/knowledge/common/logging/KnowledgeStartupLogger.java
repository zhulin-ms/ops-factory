package com.huawei.opsfactory.knowledge.common.logging;

import com.huawei.opsfactory.knowledge.config.KnowledgeDatabaseProperties;
import com.huawei.opsfactory.knowledge.config.KnowledgeLoggingProperties;
import com.huawei.opsfactory.knowledge.config.KnowledgeProperties;
import com.huawei.opsfactory.knowledge.config.KnowledgeRuntimeProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
public class KnowledgeStartupLogger implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeStartupLogger.class);
    private static final String DEFAULT_PLACEHOLDER_KEY = "sk-or-v1-xxx";

    private final KnowledgeRuntimeProperties runtimeProperties;
    private final KnowledgeDatabaseProperties databaseProperties;
    private final KnowledgeProperties knowledgeProperties;
    private final KnowledgeLoggingProperties loggingProperties;

    public KnowledgeStartupLogger(
        KnowledgeRuntimeProperties runtimeProperties,
        KnowledgeDatabaseProperties databaseProperties,
        KnowledgeProperties knowledgeProperties,
        KnowledgeLoggingProperties loggingProperties
    ) {
        this.runtimeProperties = runtimeProperties;
        this.databaseProperties = databaseProperties;
        this.knowledgeProperties = knowledgeProperties;
        this.loggingProperties = loggingProperties;
    }

    @Override
    public void run(ApplicationArguments args) {
        log.info(
            "knowledge-service startup ready baseDir={} databaseType={} retrievalMode={} embeddingModel={} remoteEmbeddingEnabled={} includeQueryText={}",
            runtimeProperties.getBaseDir(),
            databaseProperties.getType(),
            knowledgeProperties.getRetrieval().getMode(),
            knowledgeProperties.getEmbedding().getModel(),
            isRemoteEmbeddingEnabled(),
            loggingProperties.isIncludeQueryText()
        );
    }

    private boolean isRemoteEmbeddingEnabled() {
        String apiKey = knowledgeProperties.getEmbedding().getApiKey();
        String baseUrl = knowledgeProperties.getEmbedding().getBaseUrl();
        return StringUtils.hasText(apiKey)
            && !DEFAULT_PLACEHOLDER_KEY.equals(apiKey)
            && StringUtils.hasText(baseUrl);
    }
}
