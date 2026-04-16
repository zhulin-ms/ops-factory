package com.huawei.opsfactory.businessintelligence.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "business-intelligence")
public class BusinessIntelligenceRuntimeProperties {

    private String corsOrigin = "*";
    private Runtime runtime = new Runtime();
    private Logging logging = new Logging();

    public String getCorsOrigin() {
        return corsOrigin;
    }

    public void setCorsOrigin(String corsOrigin) {
        this.corsOrigin = corsOrigin;
    }

    public Runtime getRuntime() {
        return runtime;
    }

    public void setRuntime(Runtime runtime) {
        this.runtime = runtime;
    }

    public Logging getLogging() {
        return logging;
    }

    public void setLogging(Logging logging) {
        this.logging = logging;
    }

    public String getBaseDir() {
        return runtime.getBaseDir();
    }

    public void setBaseDir(String baseDir) {
        runtime.setBaseDir(baseDir);
    }

    public boolean isCacheEnabled() {
        return runtime.isCacheEnabled();
    }

    public void setCacheEnabled(boolean cacheEnabled) {
        runtime.setCacheEnabled(cacheEnabled);
    }

    public static class Runtime {

        private String baseDir = "./data";
        private boolean cacheEnabled = true;

        public String getBaseDir() {
            return baseDir;
        }

        public void setBaseDir(String baseDir) {
            this.baseDir = baseDir;
        }

        public boolean isCacheEnabled() {
            return cacheEnabled;
        }

        public void setCacheEnabled(boolean cacheEnabled) {
            this.cacheEnabled = cacheEnabled;
        }
    }

    public static class Logging {

        private boolean accessLogEnabled = true;

        public boolean isAccessLogEnabled() {
            return accessLogEnabled;
        }

        public void setAccessLogEnabled(boolean accessLogEnabled) {
            this.accessLogEnabled = accessLogEnabled;
        }
    }
}
