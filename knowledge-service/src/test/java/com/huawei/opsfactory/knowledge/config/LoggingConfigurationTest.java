package com.huawei.opsfactory.knowledge.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.huawei.opsfactory.knowledge.service.EmbeddingService;
import com.huawei.opsfactory.knowledge.service.KnowledgeServiceFacade;
import com.huawei.opsfactory.knowledge.support.TestLogAppender;
import org.apache.logging.log4j.Level;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.core.LoggerContext;
import org.apache.logging.log4j.core.config.Configuration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest(properties = {
    "knowledge.runtime.base-dir=target/test-runtime-logging-config",
    "logging.level.root=ERROR",
    "logging.level.com.huawei.opsfactory.knowledge=INFO",
    "logging.level.com.huawei.opsfactory.knowledge.service.EmbeddingService=DEBUG"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class LoggingConfigurationTest {

    @Autowired
    private EmbeddingService embeddingService;

    @Test
    void shouldLoadLog4j2ConfigurationAndApplyConfiguredLevels() {
        LoggerContext context = (LoggerContext) LogManager.getContext(false);
        Configuration configuration = context.getConfiguration();

        assertThat((Object) configuration.getAppender("File")).isNotNull();
        assertThat((Object) configuration.getAppender("Console")).isNotNull();
        assertThat(configuration.getRootLogger().getLevel()).isEqualTo(Level.ERROR);
        assertThat(configuration.getLoggerConfig(KnowledgeServiceFacade.class.getName()).getLevel()).isEqualTo(Level.INFO);
        assertThat(configuration.getLoggerConfig(EmbeddingService.class.getName()).getLevel()).isEqualTo(Level.DEBUG);

        try (
            TestLogAppender embeddingAppender = TestLogAppender.attachTo(EmbeddingService.class);
            TestLogAppender outsideAppender = TestLogAppender.attachTo("outside.test")
        ) {
            embeddingService.embedQuery("ITSM deployment");
            org.apache.logging.log4j.Logger outsideLogger = LogManager.getLogger("outside.test");
            outsideLogger.debug("outside debug");
            outsideLogger.error("outside error");

            assertThat(embeddingAppender.formattedMessages())
                .anyMatch(message -> message.contains("Using local embeddings because remote embedding is not enabled"));
            assertThat(outsideAppender.formattedMessages()).containsExactly("outside error");
        }
    }
}
