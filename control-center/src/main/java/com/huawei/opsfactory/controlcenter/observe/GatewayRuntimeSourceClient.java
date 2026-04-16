package com.huawei.opsfactory.controlcenter.observe;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huawei.opsfactory.controlcenter.config.ControlCenterProperties;
import com.huawei.opsfactory.controlcenter.registry.ManagedServiceRegistry;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class GatewayRuntimeSourceClient {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final HttpSupport httpSupport;
    private final ControlCenterProperties.ServiceTarget gateway;

    public GatewayRuntimeSourceClient(HttpSupport httpSupport, ManagedServiceRegistry registry) {
        this.httpSupport = httpSupport;
        this.gateway = registry.require("gateway");
    }

    public Map<String, Object> getSystem() {
        return getMap("/gateway/runtime-source/system");
    }

    public Map<String, Object> getInstances() {
        return getMap("/gateway/runtime-source/instances");
    }

    public Map<String, Object> getAgents() {
        return getMap("/gateway/agents");
    }

    public Map<String, Object> getMetrics() {
        return getMap("/gateway/runtime-source/metrics");
    }

    private Map<String, Object> getMap(String path) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("x-secret-key", gateway.getAuth().getSecretKey());
            headers.set("x-user-id", "admin");
            String url = gateway.getBaseUrl() + path;
            var response = httpSupport.get(url, headers);
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new IllegalStateException("Gateway runtime source returned HTTP " + response.statusCode());
            }
            return MAPPER.readValue(response.body(), new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            throw new IllegalStateException("Failed to fetch gateway runtime source " + path + ": " + e.getMessage(), e);
        }
    }
}
