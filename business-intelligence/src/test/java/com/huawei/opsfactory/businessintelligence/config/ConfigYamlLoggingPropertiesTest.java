package com.huawei.opsfactory.businessintelligence.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.apache.logging.log4j.Level;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.core.LoggerContext;
import org.apache.logging.log4j.core.config.Configuration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;

@SpringBootTest
class ConfigYamlLoggingPropertiesTest {

    @Autowired
    private Environment environment;

    @Autowired
    private BusinessIntelligenceRuntimeProperties properties;

    @Test
    void shouldLoadLoggingSettingsFromConfigYaml() {
        LoggerContext context = (LoggerContext) LogManager.getContext(false);
        Configuration configuration = context.getConfiguration();

        assertThat(properties.getLogging().isAccessLogEnabled()).isTrue();
        assertThat(properties.getBaseDir()).isEqualTo("./data");
        assertThat(properties.isCacheEnabled()).isTrue();
        assertThat(environment.getProperty("business-intelligence.logging.access-log-enabled", Boolean.class)).isTrue();
        assertThat(environment.getProperty("logging.level.root")).isEqualTo("INFO");
        assertThat(environment.getProperty("logging.level.com.huawei.opsfactory.businessintelligence")).isEqualTo("INFO");
        assertThat(environment.getProperty("logging.level.org.springframework")).isEqualTo("WARN");

        assertThat(configuration.getRootLogger().getLevel()).isEqualTo(Level.INFO);
        assertThat(configuration.getLoggerConfig("com.huawei.opsfactory.businessintelligence").getLevel()).isEqualTo(Level.INFO);
    }
}
