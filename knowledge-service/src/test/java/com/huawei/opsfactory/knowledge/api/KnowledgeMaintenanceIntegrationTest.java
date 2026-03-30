package com.huawei.opsfactory.knowledge.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
class KnowledgeMaintenanceIntegrationTest {

    private static final Path RUNTIME_BASE_DIR = Path.of("target/test-runtime-maintenance").toAbsolutePath().normalize();
    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @DynamicPropertySource
    static void registerProperties(DynamicPropertyRegistry registry) {
        registry.add("knowledge.runtime.base-dir", () -> RUNTIME_BASE_DIR.toString());
    }

    @BeforeEach
    void resetState() throws IOException {
        jdbcTemplate.execute("delete from document_chunk");
        jdbcTemplate.execute("delete from maintenance_job_failure");
        jdbcTemplate.execute("delete from knowledge_document");
        jdbcTemplate.execute("delete from ingestion_job");
        jdbcTemplate.execute("delete from source_profile_binding");
        jdbcTemplate.execute("delete from knowledge_source");
        recreateDirectory(RUNTIME_BASE_DIR.resolve("upload"));
        recreateDirectory(RUNTIME_BASE_DIR.resolve("artifacts"));
        recreateDirectory(RUNTIME_BASE_DIR.resolve("indexes"));
    }

    @Test
    void indexProfileConfigChangesRequireRebuildButRetrievalConfigChangesDoNot() throws Exception {
        String sourceId = createSource();
        JsonNode before = getSource(sourceId);
        String indexProfileId = before.path("indexProfileId").asText();
        String retrievalProfileId = before.path("retrievalProfileId").asText();

        mockMvc.perform(patch("/ops-knowledge/profiles/retrieval/{profileId}", retrievalProfileId)
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
            .andExpect(status().isOk());

        JsonNode afterRetrievalChange = getSource(sourceId);
        assertThat(afterRetrievalChange.path("rebuildRequired").asBoolean()).isFalse();

        mockMvc.perform(patch("/ops-knowledge/profiles/index/{profileId}", indexProfileId)
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
            .andExpect(status().isOk());

        JsonNode afterIndexChange = getSource(sourceId);
        assertThat(afterIndexChange.path("rebuildRequired").asBoolean()).isTrue();
    }

    @Test
    void maintenanceModeBlocksSearchAndIngest() throws Exception {
        String sourceId = createSource();
        jdbcTemplate.update(
            "update knowledge_source set runtime_status = 'MAINTENANCE', runtime_message = ? where id = ?",
            "知识库重建中，请稍后再试",
            sourceId
        );

        MvcResult searchResult = mockMvc.perform(post("/ops-knowledge/search")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "query": "runbook",
                      "sourceIds": ["%s"]
                    }
                    """.formatted(sourceId)))
            .andExpect(status().isConflict())
            .andReturn();
        assertThat(readJson(searchResult).path("code").asText()).isEqualTo("SOURCE_IN_MAINTENANCE");

        MockMultipartFile file = mockTextFile("maintenance-check.txt", "runbook maintenance check");
        MvcResult ingestResult = mockMvc.perform(multipart("/ops-knowledge/sources/{sourceId}/documents:ingest", sourceId)
                .file(file))
            .andExpect(status().isConflict())
            .andReturn();
        assertThat(readJson(ingestResult).path("code").asText()).isEqualTo("SOURCE_IN_MAINTENANCE");
    }

    @Test
    void rebuildSourceRunsAsAsyncJobAndClearsPendingFlagOnSuccess() throws Exception {
        String sourceId = createSource();
        uploadRunbook(sourceId);
        JsonNode sourceBefore = getSource(sourceId);
        String indexProfileId = sourceBefore.path("indexProfileId").asText();

        mockMvc.perform(patch("/ops-knowledge/profiles/index/{profileId}", indexProfileId)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "config": {
                        "chunking": {
                          "targetTokens": 256
                        }
                      }
                    }
                    """))
            .andExpect(status().isOk());
        assertThat(getSource(sourceId).path("rebuildRequired").asBoolean()).isTrue();

        JsonNode rebuildResponse = readJson(mockMvc.perform(post("/ops-knowledge/sources/{sourceId}:rebuild", sourceId))
            .andExpect(status().isOk())
            .andReturn());
        assertThat(rebuildResponse.path("status").asText()).isEqualTo("RUNNING");

        String jobId = rebuildResponse.path("jobId").asText();
        JsonNode job = waitForJob(jobId);
        assertThat(job.path("status").asText()).isEqualTo("SUCCEEDED");

        JsonNode sourceAfter = getSource(sourceId);
        assertThat(sourceAfter.path("runtimeStatus").asText()).isEqualTo("ACTIVE");
        assertThat(sourceAfter.path("rebuildRequired").asBoolean()).isFalse();
        assertThat(sourceAfter.path("currentJobId").isNull()).isTrue();
    }

    @Test
    void maintenanceOverviewExposesLatestJobAndFailureDetails() throws Exception {
        String sourceId = createSource();
        String jobId = "job_manual_failure";
        jdbcTemplate.update("""
            insert into ingestion_job (
                id, job_type, source_id, document_id, status, progress, stage, message, created_by,
                total_documents, processed_documents, success_documents, failed_documents,
                current_document_id, current_document_name, error_summary, started_at, finished_at, created_at, updated_at
            ) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            jobId, "SOURCE_REBUILD", sourceId, null, "FAILED", 100, "COMPLETED", "Source rebuild completed with failures",
            "admin", 3, 3, 2, 1, null, null, "1 个文档处理失败",
            "2026-03-30T05:00:00Z", "2026-03-30T05:10:00Z", "2026-03-30T05:00:00Z", "2026-03-30T05:10:00Z"
        );
        jdbcTemplate.update("""
            insert into maintenance_job_failure (id, job_id, source_id, document_id, document_name, stage, error_code, message, finished_at)
            values (?,?,?,?,?,?,?,?,?)
            """,
            "mjf_001", jobId, sourceId, null, "broken.pdf", "INDEXING", "INDEX_WRITE_FAILED", "索引写入失败", "2026-03-30T05:09:00Z"
        );

        JsonNode overview = readJson(mockMvc.perform(get("/ops-knowledge/sources/{sourceId}/maintenance", sourceId))
            .andExpect(status().isOk())
            .andReturn());
        assertThat(overview.path("currentJob").isNull()).isTrue();
        assertThat(overview.path("lastCompletedJob").path("id").asText()).isEqualTo(jobId);
        assertThat(overview.path("lastCompletedJob").path("failedDocuments").asInt()).isEqualTo(1);

        JsonNode failures = readJson(mockMvc.perform(get("/ops-knowledge/jobs/{jobId}/failures", jobId))
            .andExpect(status().isOk())
            .andReturn());
        assertThat(failures.path("items").size()).isEqualTo(1);
        assertThat(failures.path("items").get(0).path("documentName").asText()).isEqualTo("broken.pdf");
        assertThat(failures.path("items").get(0).path("errorCode").asText()).isEqualTo("INDEX_WRITE_FAILED");
    }

    private String createSource() throws Exception {
        JsonNode json = readJson(mockMvc.perform(post("/ops-knowledge/sources")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                    {
                      "name": "maintenance-source",
                      "description": "maintenance test source"
                    }
                    """))
            .andExpect(status().isOk())
            .andReturn());
        return json.path("id").asText();
    }

    private void uploadRunbook(String sourceId) throws Exception {
        MockMultipartFile file = mockTextFile(
            "sample-runbook.txt",
            """
            # Sample Runbook

            Restart the affected service, verify the topology, and confirm incident recovery.
            """
        );
        mockMvc.perform(multipart("/ops-knowledge/sources/{sourceId}/documents:ingest", sourceId)
                .file(file))
            .andExpect(status().isOk());
    }

    private MockMultipartFile mockTextFile(String fileName, String content) {
        return new MockMultipartFile("files", fileName, MediaType.TEXT_PLAIN_VALUE, content.getBytes());
    }

    private JsonNode getSource(String sourceId) throws Exception {
        return readJson(mockMvc.perform(get("/ops-knowledge/sources/{sourceId}", sourceId))
            .andExpect(status().isOk())
            .andReturn());
    }

    private JsonNode waitForJob(String jobId) throws Exception {
        for (int attempt = 0; attempt < 40; attempt++) {
            JsonNode job = readJson(mockMvc.perform(get("/ops-knowledge/jobs/{jobId}", jobId))
                .andExpect(status().isOk())
                .andReturn());
            String status = job.path("status").asText();
            if (!"RUNNING".equals(status)) {
                return job;
            }
            Thread.sleep(100L);
        }
        throw new IllegalStateException("Timed out waiting for job " + jobId);
    }

    private JsonNode readJson(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private void recreateDirectory(Path path) throws IOException {
        if (Files.exists(path)) {
            try (Stream<Path> walk = Files.walk(path)) {
                walk.sorted(Comparator.reverseOrder())
                    .forEach(current -> {
                        try {
                            Files.deleteIfExists(current);
                        } catch (IOException e) {
                            throw new IllegalStateException(e);
                        }
                    });
            }
        }
        Files.createDirectories(path);
    }
}
