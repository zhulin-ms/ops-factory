package com.huawei.opsfactory.knowledge.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.huawei.opsfactory.knowledge.api.KnowledgeApiIntegrationTestSupport;
import com.huawei.opsfactory.knowledge.config.KnowledgeLoggingProperties;
import com.huawei.opsfactory.knowledge.support.TestLogAppender;
import java.io.IOException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class KnowledgeServiceLoggingTest extends KnowledgeApiIntegrationTestSupport {

    @Autowired
    private KnowledgeLoggingProperties knowledgeLoggingProperties;

    @BeforeEach
    void setUp() throws IOException {
        resetRuntimeState();
        knowledgeLoggingProperties.setIncludeQueryText(false);
    }

    @AfterEach
    void tearDown() {
        knowledgeLoggingProperties.setIncludeQueryText(false);
    }

    @Test
    void shouldMaskQueryTextWhenQueryLoggingIsDisabled() throws Exception {
        String sourceId = createSource();
        uploadMarkdownFile(sourceId, "search-log.md", "# CPU rollback\ncpu overload rollback plan");

        try (TestLogAppender appender = TestLogAppender.attachTo(KnowledgeServiceFacade.class)) {
            search(sourceId, "cpu overload");

            assertThat(appender.formattedMessages())
                .anySatisfy(message -> {
                    assertThat(message).contains("Search completed query=len=");
                    assertThat(message).doesNotContain("cpu overload");
                });
        }
    }

    @Test
    void shouldIncludeQueryTextWhenQueryLoggingIsEnabled() throws Exception {
        knowledgeLoggingProperties.setIncludeQueryText(true);
        String sourceId = createSource();
        uploadMarkdownFile(sourceId, "search-log.md", "# CPU rollback\ncpu overload rollback plan");

        try (TestLogAppender appender = TestLogAppender.attachTo(KnowledgeServiceFacade.class)) {
            search(sourceId, "cpu overload");

            assertThat(appender.formattedMessages())
                .anySatisfy(message -> assertThat(message).contains("Search completed query=cpu overload"));
        }
    }
}
