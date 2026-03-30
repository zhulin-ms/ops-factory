package com.huawei.opsfactory.knowledge.schema;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class FlywayMigrationResourceTest {

    @Test
    void shouldShipFlywayMigrationScriptsForRuntimeBootstrap() throws IOException {
        ClassPathResource initScript = new ClassPathResource("db/migration/common/V1__init.sql");

        assertThat(initScript.exists()).isTrue();

        String sql = initScript.getContentAsString(StandardCharsets.UTF_8);

        assertThat(sql).contains("CREATE TABLE IF NOT EXISTS knowledge_source");
        assertThat(sql).contains("CREATE TABLE IF NOT EXISTS knowledge_document");
        assertThat(sql).contains("CREATE TABLE IF NOT EXISTS document_chunk");
        assertThat(sql).contains("CREATE TABLE IF NOT EXISTS ingestion_job");
    }
}
