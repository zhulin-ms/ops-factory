package com.huawei.opsfactory.businessintelligence.common.logging;

import com.huawei.opsfactory.businessintelligence.config.BusinessIntelligenceRuntimeProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class BusinessIntelligenceStartupLogger implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(BusinessIntelligenceStartupLogger.class);

    private final BusinessIntelligenceRuntimeProperties properties;

    public BusinessIntelligenceStartupLogger(BusinessIntelligenceRuntimeProperties properties) {
        this.properties = properties;
    }

    @Override
    public void run(ApplicationArguments args) {
        log.info(
            "business-intelligence startup ready baseDir={} cacheEnabled={} accessLogEnabled={}",
            properties.getBaseDir(),
            properties.isCacheEnabled(),
            properties.getLogging().isAccessLogEnabled()
        );
    }
}
