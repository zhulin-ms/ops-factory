package com.huawei.opsfactory.knowledge.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class KnowledgeDatabasePropertiesTest {

    @Test
    void shouldExposeExpectedDefaultDatabaseSettings() {
        KnowledgeDatabaseProperties properties = new KnowledgeDatabaseProperties();

        assertThat(properties.getType()).isEqualTo("sqlite");
        assertThat(properties.getUrl()).isEmpty();
        assertThat(properties.getDriverClassName()).isEmpty();
        assertThat(properties.getUsername()).isEmpty();
        assertThat(properties.getPassword()).isEmpty();
        assertThat(properties.getPool().getMaxSize()).isEqualTo(5);
        assertThat(properties.getPool().getMinIdle()).isEqualTo(1);
    }
}
