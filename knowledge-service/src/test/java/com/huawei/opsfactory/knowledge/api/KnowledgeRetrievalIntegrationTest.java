package com.huawei.opsfactory.knowledge.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class KnowledgeRetrievalIntegrationTest extends KnowledgeApiIntegrationTestSupport {

    @BeforeEach
    void setUp() throws IOException {
        resetRuntimeState();
    }

    @Test
    void shouldDifferentiateLexicalSemanticAndHybridRecallAcrossModes() throws Exception {
        String sourceId = createSource();
        uploadInputFiles(sourceId);
        JsonNode documents = listDocuments(sourceId);
        String documentId = documents.path("items").get(0).path("id").asText();

        JsonNode exactChunk = createChunk(
            documentId,
            900,
            "cpu alert exact",
            List.of("Operations", "cpu alert exact"),
            List.of("exact-alert"),
            "cpu alert exact is the authoritative incident trigger"
        );
        JsonNode semanticChunk = createChunk(
            documentId,
            901,
            "alert for cpu spikes",
            List.of("Operations", "alert for cpu spikes"),
            List.of("alert", "cpu"),
            "when cpu usage spikes, the oncall should receive an alert notification"
        );

        JsonNode lexical = search(sourceId, "cpu alert", null, 10, null, """
            {
              "mode": "lexical",
              "includeScores": true
            }
            """);
        JsonNode semantic = search(sourceId, "cpu alert", null, 10, null, """
            {
              "mode": "semantic",
              "includeScores": true
            }
            """);
        JsonNode hybrid = search(sourceId, "cpu alert", null, 10, null, """
            {
              "mode": "hybrid",
              "rrfK": 10,
              "includeScores": true
            }
            """);

        assertThat(lexical.path("hits").get(0).path("chunkId").asText()).isEqualTo(exactChunk.path("id").asText());
        assertThat(lexical.path("hits").get(0).path("lexicalScore").asDouble()).isGreaterThan(0);

        assertThat(semantic.path("hits").get(0).path("chunkId").asText()).isEqualTo(semanticChunk.path("id").asText());
        assertThat(semantic.path("hits").get(0).path("semanticScore").asDouble()).isGreaterThan(0);

        List<String> hybridTopChunkIds = stream(hybrid.path("hits"))
            .limit(2)
            .map(hit -> hit.path("chunkId").asText())
            .toList();
        assertThat(hybridTopChunkIds).contains(exactChunk.path("id").asText(), semanticChunk.path("id").asText());
    }

    @Test
    void shouldSupportCompareExplainAndContentTypeScopedRecall() throws Exception {
        String sourceId = createSource();
        uploadInputFiles(sourceId);
        JsonNode documents = listDocuments(sourceId);

        String htmlDocumentId = documentIdByName(documents, "SLA_Violation_Analysis_Report_CN.html");
        String htmlContentType = contentTypeByName(documents, "SLA_Violation_Analysis_Report_CN.html");

        JsonNode htmlSearch = search(sourceId, "SLA", List.of(htmlDocumentId), 5, List.of(htmlContentType), null);
        assertThat(htmlSearch.path("total").asInt()).isGreaterThan(0);
        String hitChunkId = htmlSearch.path("hits").get(0).path("chunkId").asText();

        JsonNode explain = readJson(mockMvc.perform(post("/knowledge/explain")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "query": "SLA",
                      "chunkId": "%s",
                      "sourceIds": ["%s"]
                    }
                    """.formatted(hitChunkId, sourceId)))
            .andExpect(status().isOk())
            .andReturn());
        assertThat(explain.path("lexical").path("matchedFields").toString()).contains("content");
        assertThat(explain.path("semantic").path("score").asDouble()).isGreaterThanOrEqualTo(0);

        JsonNode compare = compareSearch(sourceId, "SLA", List.of("hybrid", "semantic", "lexical"));
        assertThat(compare.path("fetchedTopK").asInt()).isEqualTo(64);
        assertThat(compare.path("hybrid").path("hits")).isNotEmpty();
        assertThat(compare.path("semantic").path("hits")).isNotEmpty();
        assertThat(compare.path("lexical").path("hits")).isNotEmpty();
    }

    @Test
    void shouldApplyLegacyProfileScoreThresholdForSemanticWhenOverrideOmitsThresholdField() throws Exception {
        String sourceId = createSource();
        uploadInputFiles(sourceId);
        JsonNode documents = listDocuments(sourceId);
        String documentId = documents.path("items").get(0).path("id").asText();

        createChunk(
            documentId,
            900,
            "cpu alert exact",
            List.of("Operations", "cpu alert exact"),
            List.of("exact-alert"),
            "cpu alert exact is the authoritative incident trigger"
        );
        createChunk(
            documentId,
            901,
            "alert for cpu spikes",
            List.of("Operations", "alert for cpu spikes"),
            List.of("alert", "cpu"),
            "when cpu usage spikes, the oncall should receive an alert notification"
        );

        JsonNode baseline = search(sourceId, "cpu alert", null, 10, null, """
            {
              "mode": "semantic",
              "scoreThreshold": 0.0,
              "includeScores": true
            }
            """);
        assertThat(baseline.path("total").asInt()).isGreaterThan(0);
        double topScore = baseline.path("hits").get(0).path("score").asDouble();
        double strictThreshold = topScore >= 0.999 ? 1.0 : Math.min(1.0, topScore + 0.01);

        readJson(mockMvc.perform(put("/knowledge/sources/{sourceId}/config/retrieval-profile", sourceId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "config": {
                        "retrieval": {
                          "mode": "semantic",
                          "scoreThreshold": %.6f
                        }
                      }
                    }
                    """.formatted(strictThreshold)))
            .andExpect(status().isOk())
            .andReturn());

        JsonNode filteredByProfileThreshold = search(sourceId, "cpu alert", null, 10, null, """
            {
              "mode": "semantic",
              "includeScores": true
            }
            """);
        assertThat(filteredByProfileThreshold.path("total").asInt()).isLessThan(baseline.path("total").asInt());

        JsonNode overrideDisablesThreshold = search(sourceId, "cpu alert", null, 10, null, """
            {
              "mode": "semantic",
              "scoreThreshold": 0.0,
              "includeScores": true
            }
            """);
        assertThat(overrideDisablesThreshold.path("total").asInt()).isEqualTo(baseline.path("total").asInt());
    }

    @Test
    void shouldApplyModeSpecificProfileThresholdsForSemanticAndLexicalOnly() throws Exception {
        String sourceId = createSource();
        uploadInputFiles(sourceId);
        JsonNode documents = listDocuments(sourceId);
        String documentId = documents.path("items").get(0).path("id").asText();

        createChunk(
            documentId,
            910,
            "cpu alert exact",
            List.of("Operations", "cpu alert exact"),
            List.of("exact-alert"),
            "cpu alert exact is the authoritative incident trigger"
        );
        createChunk(
            documentId,
            911,
            "alert for cpu spikes",
            List.of("Operations", "alert for cpu spikes"),
            List.of("alert", "cpu"),
            "when cpu usage spikes, the oncall should receive an alert notification"
        );

        assertProfileThresholdAppliesForMode(sourceId, "cpu alert", "semantic", "semanticThreshold");
        assertProfileThresholdAppliesForMode(sourceId, "cpu alert", "lexical", "lexicalThreshold");
    }

    @Test
    void shouldNotFilterHybridResultsUsingSemanticOrLexicalProfileThresholds() throws Exception {
        String sourceId = createSource();
        uploadInputFiles(sourceId);
        JsonNode documents = listDocuments(sourceId);
        String documentId = documents.path("items").get(0).path("id").asText();

        createChunk(
            documentId,
            920,
            "cpu alert exact",
            List.of("Operations", "cpu alert exact"),
            List.of("exact-alert"),
            "cpu alert exact is the authoritative incident trigger"
        );
        createChunk(
            documentId,
            921,
            "alert for cpu spikes",
            List.of("Operations", "alert for cpu spikes"),
            List.of("alert", "cpu"),
            "when cpu usage spikes, the oncall should receive an alert notification"
        );

        JsonNode baseline = search(sourceId, "cpu alert", null, 10, null, """
            {
              "mode": "hybrid",
              "scoreThreshold": 0.95,
              "includeScores": true
            }
            """);
        assertThat(baseline.path("total").asInt()).isGreaterThan(0);

        readJson(mockMvc.perform(put("/knowledge/sources/{sourceId}/config/retrieval-profile", sourceId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "config": {
                        "retrieval": {
                          "mode": "hybrid",
                          "scoreThreshold": 0.95,
                          "semanticThreshold": 0.95,
                          "lexicalThreshold": 0.95
                        }
                      }
                    }
                    """))
            .andExpect(status().isOk())
            .andReturn());

        JsonNode hybrid = search(sourceId, "cpu alert", null, 10, null, """
            {
              "mode": "hybrid",
              "includeScores": true
            }
            """);
        assertThat(hybrid.path("total").asInt()).isEqualTo(baseline.path("total").asInt());
    }

    private void assertProfileThresholdAppliesForMode(
        String sourceId,
        String query,
        String mode,
        String profileThresholdField
    ) throws Exception {
        JsonNode baseline = search(sourceId, query, null, 10, null, """
            {
              "mode": "%s",
              "scoreThreshold": 0.0,
              "includeScores": true
            }
            """.formatted(mode));
        assertThat(baseline.path("total").asInt()).isGreaterThan(1);

        double topScore = baseline.path("hits").get(0).path("score").asDouble();
        double strictThreshold = topScore >= 0.999 ? 1.0 : Math.min(1.0, topScore + 0.01);

        readJson(mockMvc.perform(put("/knowledge/sources/{sourceId}/config/retrieval-profile", sourceId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "config": {
                        "retrieval": {
                          "mode": "%s",
                          "%s": %.6f
                        }
                      }
                    }
                    """.formatted(mode, profileThresholdField, strictThreshold)))
            .andExpect(status().isOk())
            .andReturn());

        JsonNode filtered = search(sourceId, query, null, 10, null, """
            {
              "mode": "%s",
              "includeScores": true
            }
            """.formatted(mode));
        assertThat(filtered.path("total").asInt()).isLessThan(baseline.path("total").asInt());

        readJson(mockMvc.perform(put("/knowledge/sources/{sourceId}/config/retrieval-profile", sourceId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "config": {
                        "retrieval": {
                          "mode": "%s",
                          "%s": 0.0
                        }
                      }
                    }
                    """.formatted(mode, profileThresholdField)))
            .andExpect(status().isOk())
            .andReturn());

        JsonNode restored = search(sourceId, query, null, 10, null, """
            {
              "mode": "%s",
              "includeScores": true
            }
            """.formatted(mode));
        assertThat(restored.path("total").asInt()).isEqualTo(baseline.path("total").asInt());
    }

    private JsonNode createChunk(
        String documentId,
        int ordinal,
        String title,
        List<String> titlePath,
        List<String> keywords,
        String text
    ) throws Exception {
        return readJson(mockMvc.perform(post("/knowledge/documents/{documentId}/chunks", documentId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "ordinal": %d,
                      "title": "%s",
                      "titlePath": %s,
                      "keywords": %s,
                      "text": "%s",
                      "markdown": "%s",
                      "pageFrom": 1,
                      "pageTo": 1
                    }
                    """.formatted(
                    ordinal,
                    title,
                    objectMapper.writeValueAsString(titlePath),
                    objectMapper.writeValueAsString(keywords),
                    text,
                    text
                )))
            .andExpect(status().isOk())
            .andReturn());
    }
}
