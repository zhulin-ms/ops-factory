package com.huawei.opsfactory.gateway.config;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.huawei.opsfactory.gateway.filter.RequestContextFilter;
import com.huawei.opsfactory.gateway.support.TestLogAppender;
import org.apache.logging.log4j.Level;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.core.LoggerContext;
import org.apache.logging.log4j.core.config.Configuration;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.test.context.junit4.SpringRunner;

@RunWith(SpringRunner.class)
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.NONE,
    properties = "spring.config.import=optional:file:src/test/resources/config/test-gateway-config.yaml"
)
public class GatewayConfigImportTest {

    @Autowired
    private GatewayProperties properties;

    @Autowired
    private Environment environment;

    @Test
    public void shouldImportGatewayConfigYamlIntoSpringEnvironment() {
        assertEquals("127.0.0.1", environment.getProperty("server.address"));
        assertEquals("39001", environment.getProperty("server.port"));
        assertEquals("WARN", environment.getProperty("logging.level.root"));
        assertEquals("DEBUG", environment.getProperty("logging.level.com.huawei.opsfactory.gateway"));

        assertEquals("imported-test-key", properties.getSecretKey());
        assertEquals("https://example.test", properties.getCorsOrigin());
        assertFalse(properties.isGooseTls());
        assertEquals(21, properties.getIdle().getTimeoutMinutes());
        assertEquals(61000L, properties.getIdle().getCheckIntervalMs());
        assertFalse(properties.getLogging().isAccessLogEnabled());
        assertTrue(properties.getLogging().isIncludeUpstreamErrorBody());
        assertTrue(properties.getLogging().isIncludeSseChunkPreview());
        assertEquals(42, properties.getLogging().getSseChunkPreviewMaxChars());
    }

    @Test
    public void shouldApplyLoggingLevelsToLog4jRuntime() {
        LoggerContext context = (LoggerContext) LogManager.getContext(false);
        Configuration configuration = context.getConfiguration();

        assertEquals(Level.WARN, configuration.getRootLogger().getLevel());
        assertEquals(Level.DEBUG, configuration.getLoggerConfig("com.huawei.opsfactory.gateway").getLevel());

        try (TestLogAppender appender = TestLogAppender.attachTo(RequestContextFilter.class)) {
            org.slf4j.Logger logger = org.slf4j.LoggerFactory.getLogger(RequestContextFilter.class);
            logger.debug("request-context-debug-test");
            logger.info("request-context-info-test");

            assertTrue(appender.formattedMessages().contains("request-context-debug-test"));
            assertTrue(appender.formattedMessages().contains("request-context-info-test"));
        }
    }
}
