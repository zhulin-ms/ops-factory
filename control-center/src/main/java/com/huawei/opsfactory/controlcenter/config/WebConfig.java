package com.huawei.opsfactory.controlcenter.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.net.URI;
import java.util.LinkedHashSet;
import java.util.Set;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final ControlCenterProperties properties;

    public WebConfig(ControlCenterProperties properties) {
        this.properties = properties;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/control-center/**")
                .allowedOrigins(resolveAllowedOrigins())
                .allowedMethods("GET", "POST", "PUT", "OPTIONS")
                .allowedHeaders("content-type", "x-secret-key");
    }

    private String[] resolveAllowedOrigins() {
        Set<String> origins = new LinkedHashSet<>();
        String configuredOrigin = properties.getCorsOrigin();
        if (configuredOrigin == null || configuredOrigin.isBlank()) {
            return new String[0];
        }
        origins.add(configuredOrigin);
        try {
            URI uri = URI.create(configuredOrigin);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            int port = uri.getPort();
            if ("127.0.0.1".equals(host) || "localhost".equals(host)) {
                origins.add(buildOrigin(scheme, "127.0.0.1", port));
                origins.add(buildOrigin(scheme, "localhost", port));
            }
        } catch (Exception ignored) {
        }
        return origins.toArray(String[]::new);
    }

    private static String buildOrigin(String scheme, String host, int port) {
        return port > 0 ? scheme + "://" + host + ":" + port : scheme + "://" + host;
    }
}
