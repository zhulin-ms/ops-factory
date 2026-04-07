package com.huawei.opsfactory.knowledge.common.logging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.huawei.opsfactory.knowledge.api.KnowledgeApiIntegrationTestSupport;
import com.huawei.opsfactory.knowledge.support.TestLogAppender;
import java.io.IOException;
import java.util.Objects;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

class RequestLoggingFilterIntegrationTest extends KnowledgeApiIntegrationTestSupport {

    @BeforeEach
    void setUp() throws IOException {
        resetRuntimeState();
    }

    @Test
    void shouldGenerateRequestIdAndWriteAccessLog() throws Exception {
        try (TestLogAppender appender = TestLogAppender.attachTo(RequestLoggingFilter.class)) {
            MvcResult result = mockMvc.perform(get("/knowledge/system/defaults"))
                .andExpect(status().isOk())
                .andReturn();

            String requestId = result.getResponse().getHeader(LoggingKeys.REQUEST_ID_HEADER);

            assertThat(requestId).isNotBlank();
            assertThat(appender.events())
                .anySatisfy(event -> {
                    String loggedRequestId = Objects.toString(event.getContextData().getValue(LoggingKeys.REQUEST_ID), null);
                    assertThat(event.getMessage().getFormattedMessage())
                        .contains("HTTP GET /knowledge/system/defaults completed status=200");
                    assertThat(loggedRequestId).isEqualTo(requestId);
                });
        }
    }

    @Test
    void shouldReuseIncomingRequestIdHeader() throws Exception {
        try (TestLogAppender appender = TestLogAppender.attachTo(RequestLoggingFilter.class)) {
            String requestId = "req-fixed-123";

            MvcResult result = mockMvc.perform(get("/knowledge/system/defaults")
                    .header(LoggingKeys.REQUEST_ID_HEADER, requestId))
                .andExpect(status().isOk())
                .andReturn();

            assertThat(result.getResponse().getHeader(LoggingKeys.REQUEST_ID_HEADER)).isEqualTo(requestId);
            assertThat(appender.events())
                .anySatisfy(event -> {
                    String loggedRequestId = Objects.toString(event.getContextData().getValue(LoggingKeys.REQUEST_ID), null);
                    assertThat(loggedRequestId).isEqualTo(requestId);
                });
        }
    }
}
