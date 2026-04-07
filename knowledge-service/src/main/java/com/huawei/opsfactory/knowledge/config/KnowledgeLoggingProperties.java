package com.huawei.opsfactory.knowledge.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "knowledge.logging")
public class KnowledgeLoggingProperties {

    private boolean includeQueryText = false;

    public boolean isIncludeQueryText() {
        return includeQueryText;
    }

    public void setIncludeQueryText(boolean includeQueryText) {
        this.includeQueryText = includeQueryText;
    }
}
