package com.huawei.opsfactory.controlcenter.observe;

import com.huawei.opsfactory.controlcenter.config.ControlCenterProperties;
import com.huawei.opsfactory.controlcenter.events.EventStoreService;
import com.huawei.opsfactory.controlcenter.model.ControlCenterEvent;
import com.huawei.opsfactory.controlcenter.model.ManagedServiceStatus;
import com.huawei.opsfactory.controlcenter.registry.ManagedServiceRegistry;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ServiceHealthProbeService {

    private final ManagedServiceRegistry registry;
    private final HttpSupport httpSupport;
    private final EventStoreService eventStoreService;
    private final Map<String, String> lastStatusByService = new ConcurrentHashMap<>();

    public ServiceHealthProbeService(ManagedServiceRegistry registry,
                                     HttpSupport httpSupport,
                                     EventStoreService eventStoreService) {
        this.registry = registry;
        this.httpSupport = httpSupport;
        this.eventStoreService = eventStoreService;
    }

    public List<ManagedServiceStatus> listStatuses() {
        return registry.list().stream().map(this::probe).toList();
    }

    public ManagedServiceStatus getStatus(String id) {
        return probe(registry.require(id));
    }

    private ManagedServiceStatus probe(ControlCenterProperties.ServiceTarget service) {
        long checkedAt = System.currentTimeMillis();
        String url = normalizeUrl(service.getBaseUrl(), service.getHealthPath());
        HttpHeaders headers = new HttpHeaders();
        if ("secret-key".equalsIgnoreCase(service.getAuth().getType()) && service.getAuth().getSecretKey() != null && !service.getAuth().getSecretKey().isBlank()) {
            headers.set("x-secret-key", service.getAuth().getSecretKey());
        }
        try {
            var response = httpSupport.get(url, headers);
            boolean healthy = response.statusCode() >= 200 && response.statusCode() < 300;
            ManagedServiceStatus status = new ManagedServiceStatus(
                    service.getId(),
                    service.getName(),
                    service.isRequired(),
                    healthy ? "healthy" : "down",
                    healthy,
                    service.getBaseUrl(),
                    service.getHealthPath(),
                    checkedAt,
                    healthy ? null : "HTTP " + response.statusCode()
            );
            recordStatusChange(status);
            return status;
        } catch (Exception e) {
            ManagedServiceStatus status = new ManagedServiceStatus(
                    service.getId(),
                    service.getName(),
                    service.isRequired(),
                    "down",
                    false,
                    service.getBaseUrl(),
                    service.getHealthPath(),
                    checkedAt,
                    e.getMessage()
            );
            recordStatusChange(status);
            return status;
        }
    }

    private void recordStatusChange(ManagedServiceStatus status) {
        String previous = lastStatusByService.put(status.id(), status.status());
        if (previous == null || previous.equals(status.status())) {
            return;
        }
        String level = "healthy".equals(status.status()) ? "info" : "warning";
        eventStoreService.append(new ControlCenterEvent(
                System.currentTimeMillis(),
                "health-transition",
                status.id(),
                status.name(),
                level,
                "Health changed from " + previous + " to " + status.status()
        ));
    }

    private static String normalizeUrl(String baseUrl, String path) {
        String base = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        String suffix = path.startsWith("/") ? path : "/" + path;
        return base + suffix;
    }
}
