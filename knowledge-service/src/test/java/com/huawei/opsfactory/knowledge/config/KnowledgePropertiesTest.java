package com.huawei.opsfactory.knowledge.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class KnowledgePropertiesTest {

    @Test
    void shouldExposeExpectedDefaultBusinessSettings() {
        KnowledgeProperties properties = new KnowledgeProperties();

        assertThat(properties.getIngest().getMaxFileSizeMb()).isEqualTo(100);
        assertThat(properties.getIngest().getDeduplication()).isEqualTo("sha256");

        assertThat(properties.getConvert().getEngine()).isEqualTo("tika");
        assertThat(properties.getConvert().isEnablePdfboxFallback()).isTrue();

        assertThat(properties.getAnalysis().getLanguage()).isEqualTo("zh");
        assertThat(properties.getAnalysis().getIndexAnalyzer()).isEqualTo("smartcn");
        assertThat(properties.getAnalysis().getQueryAnalyzer()).isEqualTo("smartcn");

        assertThat(properties.getChunking().getMode()).isEqualTo("hierarchical");
        assertThat(properties.getChunking().getTargetTokens()).isEqualTo(500);
        assertThat(properties.getChunking().getOverlapTokens()).isEqualTo(80);
        assertThat(properties.getChunking().isRespectHeadings()).isTrue();
        assertThat(properties.getChunking().isKeepTablesWhole()).isTrue();

        assertThat(properties.getEmbedding().getBaseUrl()).isEqualTo("https://openrouter.ai/api/v1");
        assertThat(properties.getEmbedding().getModel()).isEqualTo("qwen/qwen3-embedding-4b");
        assertThat(properties.getEmbedding().getDimensions()).isEqualTo(1024);
        assertThat(properties.getIndexing().getBm25().getK1()).isEqualTo(1.2f);
        assertThat(properties.getIndexing().getBm25().getB()).isEqualTo(0.75f);

        assertThat(properties.getRetrieval().getMode()).isEqualTo("hybrid");
        assertThat(properties.getRetrieval().getLexicalTopK()).isEqualTo(50);
        assertThat(properties.getRetrieval().getSemanticTopK()).isEqualTo(50);
        assertThat(properties.getRetrieval().getFinalTopK()).isEqualTo(8);
        assertThat(properties.getRetrieval().getRrfK()).isEqualTo(60);

        assertThat(properties.getFeatures().isAllowChunkEdit()).isTrue();
        assertThat(properties.getFeatures().isAllowChunkDelete()).isTrue();
        assertThat(properties.getFeatures().isAllowExplain()).isTrue();
        assertThat(properties.getFeatures().isAllowRequestOverride()).isTrue();
    }
}
