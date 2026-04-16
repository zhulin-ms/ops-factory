package com.huawei.opsfactory.knowledge.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.huawei.opsfactory.knowledge.service.EmbeddingService;
import com.huawei.opsfactory.knowledge.service.KnowledgeServiceFacade;
import com.huawei.opsfactory.knowledge.support.TestLogAppender;
import org.apache.logging.log4j.Level;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.core.LoggerContext;
import org.apache.logging.log4j.core.config.Configuration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.core.env.Environment;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest(properties = {
    "knowledge.runtime.base-dir=target/test-runtime-config-yaml"
})
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ConfigYamlLoggingPropertiesTest {

    @Autowired
    private Environment environment;

    @Autowired
    private KnowledgeLoggingProperties knowledgeLoggingProperties;

    @Autowired
    private EmbeddingService embeddingService;

    @Autowired
    private MockMvc mockMvc;

    @Test
    void shouldLoadLoggingSettingsFromConfigYaml() {
        LoggerContext context = (LoggerContext) LogManager.getContext(false);
        Configuration configuration = context.getConfiguration();

        assertThat(knowledgeLoggingProperties.isIncludeQueryText()).isFalse();
        assertThat(environment.getProperty("knowledge.logging.include-query-text", Boolean.class)).isFalse();
        assertThat(environment.getProperty("logging.level.root")).isEqualTo("INFO");
        assertThat(environment.getProperty("logging.level.com.huawei.opsfactory.knowledge")).isEqualTo("INFO");
        assertThat(environment.getProperty("logging.level.com.huawei.opsfactory.knowledge.service.EmbeddingService")).isEqualTo("WARN");
        assertThat(environment.getProperty("logging.level.com.huawei.opsfactory.knowledge.service.SearchService")).isEqualTo("INFO");

        assertThat(configuration.getRootLogger().getLevel()).isEqualTo(Level.INFO);
        assertThat(configuration.getLoggerConfig(KnowledgeServiceFacade.class.getName()).getLevel()).isEqualTo(Level.INFO);
        assertThat(configuration.getLoggerConfig(EmbeddingService.class.getName()).getLevel()).isEqualTo(Level.WARN);
    }

    @Test
    void shouldSuppressEmbeddingDebugLogsBecauseConfigYamlSetsWarnLevel() {
        try (TestLogAppender appender = TestLogAppender.attachTo(EmbeddingService.class)) {
            embeddingService.embedQuery("config yaml debug suppression");

            assertThat(appender.formattedMessages())
                .noneMatch(message -> message.contains("Using local embeddings because remote embedding is not enabled"));
        }
    }

    @Test
    void shouldAllowFacadeInfoLogsBecauseConfigYamlSetsInfoLevel() throws Exception {
        try (TestLogAppender appender = TestLogAppender.attachTo(KnowledgeServiceFacade.class)) {
            mockMvc.perform(post("/knowledge/sources")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""
                        {
                          "name": "config-yaml-log-test-source",
                          "description": "config yaml logging verification"
                        }
                        """))
                .andExpect(status().isOk());

            assertThat(appender.formattedMessages())
                .anyMatch(message -> message.contains("Created source sourceId="));
        }
    }
}
