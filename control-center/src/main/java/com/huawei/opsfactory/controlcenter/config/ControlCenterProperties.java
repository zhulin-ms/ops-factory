package com.huawei.opsfactory.controlcenter.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

@ConfigurationProperties(prefix = "control-center")
public class ControlCenterProperties {

    private String secretKey = "change-me";
    private String corsOrigin = "http://127.0.0.1:5173";
    private int requestTimeoutMs = 5000;
    private List<ServiceTarget> services = new ArrayList<>();
    private Langfuse langfuse = new Langfuse();

    public String getSecretKey() {
        return secretKey;
    }

    public void setSecretKey(String secretKey) {
        this.secretKey = secretKey;
    }

    public String getCorsOrigin() {
        return corsOrigin;
    }

    public void setCorsOrigin(String corsOrigin) {
        this.corsOrigin = corsOrigin;
    }

    public int getRequestTimeoutMs() {
        return requestTimeoutMs;
    }

    public void setRequestTimeoutMs(int requestTimeoutMs) {
        this.requestTimeoutMs = requestTimeoutMs;
    }

    public List<ServiceTarget> getServices() {
        return services;
    }

    public void setServices(List<ServiceTarget> services) {
        this.services = services;
    }

    public Langfuse getLangfuse() {
        return langfuse;
    }

    public void setLangfuse(Langfuse langfuse) {
        this.langfuse = langfuse;
    }

    public static class ServiceTarget {
        private String id;
        private String name;
        private String baseUrl;
        private boolean required = true;
        private String healthPath;
        private String ctlComponent;
        private String configPath = "";
        private String logPath = "";
        private Auth auth = new Auth();

        public String getId() {
            return id;
        }

        public void setId(String id) {
            this.id = id;
        }

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        public boolean isRequired() {
            return required;
        }

        public void setRequired(boolean required) {
            this.required = required;
        }

        public String getHealthPath() {
            return healthPath;
        }

        public void setHealthPath(String healthPath) {
            this.healthPath = healthPath;
        }

        public String getCtlComponent() {
            return ctlComponent;
        }

        public void setCtlComponent(String ctlComponent) {
            this.ctlComponent = ctlComponent;
        }

        public String getConfigPath() {
            return configPath;
        }

        public void setConfigPath(String configPath) {
            this.configPath = configPath;
        }

        public String getLogPath() {
            return logPath;
        }

        public void setLogPath(String logPath) {
            this.logPath = logPath;
        }

        public Auth getAuth() {
            return auth;
        }

        public void setAuth(Auth auth) {
            this.auth = auth;
        }
    }

    public static class Auth {
        private String type = "none";
        private String secretKey = "";

        public String getType() {
            return type;
        }

        public void setType(String type) {
            this.type = type;
        }

        public String getSecretKey() {
            return secretKey;
        }

        public void setSecretKey(String secretKey) {
            this.secretKey = secretKey;
        }
    }

    public static class Langfuse {
        private String host = "";
        private String publicKey = "";
        private String secretKey = "";

        public String getHost() {
            return host;
        }

        public void setHost(String host) {
            this.host = host;
        }

        public String getPublicKey() {
            return publicKey;
        }

        public void setPublicKey(String publicKey) {
            this.publicKey = publicKey;
        }

        public String getSecretKey() {
            return secretKey;
        }

        public void setSecretKey(String secretKey) {
            this.secretKey = secretKey;
        }
    }
}
