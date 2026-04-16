package com.huawei.opsfactory.knowledge.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

class KnowledgeSourceProfileConfigIntegrationTest extends KnowledgeApiIntegrationTestSupport {

    @BeforeEach
    void setUp() throws IOException {
        resetRuntimeState();
    }

    @Test
    void sourceConfigUpdateClonesDefaultRetrievalProfileAndKeepsOtherSourcesOnDefault() throws Exception {
        String sourceA = createSource();
        String sourceB = createSource();

        JsonNode sourceABefore = getSource(sourceA);
        JsonNode sourceBBefore = getSource(sourceB);
        assertThat(sourceABefore.path("retrievalProfileId").asText()).isEqualTo(sourceBBefore.path("retrievalProfileId").asText());

        JsonNode updated = readJson(mockMvc.perform(put("/knowledge/sources/{sourceId}/config/retrieval-profile", sourceA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "Source A Retrieval",
                      "config": {
                        "retrieval": {
                          "scoreThreshold": 0.08
                        },
                        "result": {
                          "finalTopK": 6
                        }
                      }
                    }
                    """))
            .andExpect(status().isOk())
            .andReturn());

        assertThat(updated.path("createdFromDefault").asBoolean()).isTrue();
        assertThat(updated.path("scope").asText()).isEqualTo("source");
        assertThat(updated.path("readonly").asBoolean()).isFalse();
        assertThat(updated.path("ownerSourceId").asText()).isEqualTo(sourceA);
        assertThat(updated.path("name").asText()).isEqualTo("Source A Retrieval");
        assertThat(updated.path("config").path("retrieval").path("scoreThreshold").asDouble()).isEqualTo(0.08);
        assertThat(updated.path("config").path("result").path("finalTopK").asInt()).isEqualTo(6);

        JsonNode sourceAAfter = getSource(sourceA);
        JsonNode sourceBAfter = getSource(sourceB);
        assertThat(sourceAAfter.path("retrievalProfileId").asText()).isNotEqualTo(sourceABefore.path("retrievalProfileId").asText());
        assertThat(sourceBAfter.path("retrievalProfileId").asText()).isEqualTo(sourceBBefore.path("retrievalProfileId").asText());
    }

    @Test
    void sourceConfigUpdateAcceptsInheritedDefaultProfileNamesWithoutServerError() throws Exception {
        String sourceId = createSource();

        JsonNode retrievalResponse = readJson(mockMvc.perform(put("/knowledge/sources/{sourceId}/config/retrieval-profile", sourceId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "system-default-retrieval",
                      "config": {
                        "result": {
                          "finalTopK": 6
                        }
                      }
                    }
                    """))
            .andExpect(status().isOk())
            .andReturn());
        assertThat(retrievalResponse.path("name").asText()).isNotEqualTo("system-default-retrieval");
        assertThat(retrievalResponse.path("scope").asText()).isEqualTo("source");

        JsonNode indexResponse = readJson(mockMvc.perform(put("/knowledge/sources/{sourceId}/config/index-profile", sourceId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "system-default-index",
                      "config": {
                        "indexing": {
                          "titleBoost": 9
                        }
                      }
                    }
                    """))
            .andExpect(status().isOk())
            .andReturn());
        assertThat(indexResponse.path("name").asText()).isNotEqualTo("system-default-index");
        assertThat(indexResponse.path("scope").asText()).isEqualTo("source");
    }

    @Test
    void sourceConfigGetExposesReadonlySystemProfileMetadata() throws Exception {
        String sourceId = createSource();

        JsonNode response = readJson(mockMvc.perform(get("/knowledge/sources/{sourceId}/config/retrieval-profile", sourceId))
            .andExpect(status().isOk())
            .andReturn());

        assertThat(response.path("scope").asText()).isEqualTo("system");
        assertThat(response.path("readonly").asBoolean()).isTrue();
        assertThat(response.path("ownerSourceId").isNull()).isTrue();
    }

    @Test
    void directPatchOnReadonlyDefaultProfileIsRejected() throws Exception {
        String sourceId = createSource();
        String retrievalProfileId = getSource(sourceId).path("retrievalProfileId").asText();

        JsonNode response = readJson(mockMvc.perform(patch("/knowledge/profiles/retrieval/{profileId}", retrievalProfileId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "config": {
                        "result": {
                          "finalTopK": 9
                        }
                      }
                    }
                    """))
            .andExpect(status().isConflict())
            .andReturn());

        assertThat(response.path("code").asText()).isEqualTo("READ_ONLY_PROFILE");
    }

    @Test
    void resetToDefaultRebindsSourceAndRemovesSourceOwnedProfiles() throws Exception {
        String sourceId = createSource();
        JsonNode sourceBefore = getSource(sourceId);

        JsonNode retrievalCustom = readJson(mockMvc.perform(put("/knowledge/sources/{sourceId}/config/retrieval-profile", sourceId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "config": {
                        "result": {
                          "finalTopK": 6
                        }
                      }
                    }
                    """))
            .andExpect(status().isOk())
            .andReturn());
        String retrievalCustomId = retrievalCustom.path("id").asText();

        JsonNode indexCustom = readJson(mockMvc.perform(put("/knowledge/sources/{sourceId}/config/index-profile", sourceId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "config": {
                        "indexing": {
                          "titleBoost": 9
                        }
                      }
                    }
                    """))
            .andExpect(status().isOk())
            .andReturn());
        String indexCustomId = indexCustom.path("id").asText();

        JsonNode retrievalReset = readJson(mockMvc.perform(post("/knowledge/sources/{sourceId}/config/retrieval-profile:reset", sourceId))
            .andExpect(status().isOk())
            .andReturn());
        assertThat(retrievalReset.path("scope").asText()).isEqualTo("system");
        assertThat(retrievalReset.path("id").asText()).isEqualTo(sourceBefore.path("retrievalProfileId").asText());

        JsonNode indexReset = readJson(mockMvc.perform(post("/knowledge/sources/{sourceId}/config/index-profile:reset", sourceId))
            .andExpect(status().isOk())
            .andReturn());
        assertThat(indexReset.path("scope").asText()).isEqualTo("system");
        assertThat(indexReset.path("id").asText()).isEqualTo(sourceBefore.path("indexProfileId").asText());

        JsonNode sourceAfter = getSource(sourceId);
        assertThat(sourceAfter.path("retrievalProfileId").asText()).isEqualTo(sourceBefore.path("retrievalProfileId").asText());
        assertThat(sourceAfter.path("indexProfileId").asText()).isEqualTo(sourceBefore.path("indexProfileId").asText());
        assertThat(sourceAfter.path("rebuildRequired").asBoolean()).isTrue();

        mockMvc.perform(get("/knowledge/profiles/retrieval/{profileId}", retrievalCustomId))
            .andExpect(status().isNotFound());
        mockMvc.perform(get("/knowledge/profiles/index/{profileId}", indexCustomId))
            .andExpect(status().isNotFound());
    }

    private JsonNode getSource(String sourceId) throws Exception {
        return readJson(mockMvc.perform(get("/knowledge/sources/{sourceId}", sourceId))
            .andExpect(status().isOk())
            .andReturn());
    }
}
