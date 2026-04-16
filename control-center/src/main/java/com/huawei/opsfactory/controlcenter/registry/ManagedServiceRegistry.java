package com.huawei.opsfactory.controlcenter.registry;

import com.huawei.opsfactory.controlcenter.config.ControlCenterProperties;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class ManagedServiceRegistry {

    private final Map<String, ControlCenterProperties.ServiceTarget> servicesById;

    public ManagedServiceRegistry(ControlCenterProperties properties) {
        Map<String, ControlCenterProperties.ServiceTarget> byId = new LinkedHashMap<>();
        for (ControlCenterProperties.ServiceTarget service : properties.getServices()) {
            byId.put(service.getId(), service);
        }
        this.servicesById = byId;
    }

    public List<ControlCenterProperties.ServiceTarget> list() {
        return List.copyOf(servicesById.values());
    }

    public ControlCenterProperties.ServiceTarget require(String id) {
        ControlCenterProperties.ServiceTarget service = servicesById.get(id);
        if (service == null) {
            throw new IllegalArgumentException("Unknown managed service: " + id);
        }
        return service;
    }
}
