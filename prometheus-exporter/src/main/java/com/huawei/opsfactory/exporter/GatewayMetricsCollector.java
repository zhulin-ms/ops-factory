package com.huawei.opsfactory.exporter;

import io.prometheus.client.CollectorRegistry;
import io.prometheus.client.Gauge;
import io.prometheus.client.exporter.common.TextFormat;
import io.prometheus.client.hotspot.BufferPoolsExports;
import io.prometheus.client.hotspot.ClassLoadingExports;
import io.prometheus.client.hotspot.GarbageCollectorExports;
import io.prometheus.client.hotspot.MemoryPoolsExports;
import io.prometheus.client.hotspot.StandardExports;
import io.prometheus.client.hotspot.ThreadExports;
import io.prometheus.client.hotspot.VersionInfoExports;
import java.io.IOException;
import java.io.StringWriter;
import java.lang.management.ManagementFactory;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class GatewayMetricsCollector {

    private static final Logger log = LoggerFactory.getLogger(GatewayMetricsCollector.class);

    private final ExporterProperties config;
    private final HttpClient httpClient;
    private final CollectorRegistry registry;
    private final GatewayApi gatewayApi;

    private final Gauge gatewayUp;
    private final Gauge gatewayUptimeSeconds;
    private final Gauge agentsConfigured;
    private final Gauge instancesTotal;
    private final Gauge instanceIdleSeconds;
    private final Gauge instanceInfo;
    private final Gauge langfuseConfigured;
    private final Gauge exporterProcessCpu;
    private final Gauge exporterNodejsHeap;

    @Autowired
    public GatewayMetricsCollector(ExporterProperties config) {
        this(config, null);
    }

    GatewayMetricsCollector(ExporterProperties config, GatewayApi gatewayApi) {
        this.config = config;
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofMillis(config.getCollectTimeoutMs()))
            .build();
        this.registry = new CollectorRegistry();
        this.gatewayApi = gatewayApi != null ? gatewayApi : this::fetchJson;

        new StandardExports().register(registry);
        new MemoryPoolsExports().register(registry);
        new GarbageCollectorExports().register(registry);
        new ThreadExports().register(registry);
        new ClassLoadingExports().register(registry);
        new VersionInfoExports().register(registry);
        new BufferPoolsExports().register(registry);

        this.gatewayUp = Gauge.build()
            .name("opsfactory_gateway_up")
            .help("Whether the gateway is reachable (1 = up, 0 = down)")
            .register(registry);

        this.gatewayUptimeSeconds = Gauge.build()
            .name("opsfactory_gateway_uptime_seconds")
            .help("Gateway process uptime in seconds")
            .register(registry);

        this.agentsConfigured = Gauge.build()
            .name("opsfactory_agents_configured_total")
            .help("Number of agents configured in the gateway")
            .register(registry);

        this.instancesTotal = Gauge.build()
            .name("opsfactory_instances_total")
            .help("Total number of agent instances by status")
            .labelNames("status")
            .register(registry);

        this.instanceIdleSeconds = Gauge.build()
            .name("opsfactory_instance_idle_seconds")
            .help("How long each instance has been idle (seconds)")
            .labelNames("agent_id", "user_id")
            .register(registry);

        this.instanceInfo = Gauge.build()
            .name("opsfactory_instance_info")
            .help("Instance metadata (value is always 1)")
            .labelNames("agent_id", "user_id", "port", "status")
            .register(registry);

        this.langfuseConfigured = Gauge.build()
            .name("opsfactory_langfuse_configured")
            .help("Whether Langfuse observability is configured (1 = yes, 0 = no)")
            .register(registry);

        this.exporterProcessCpu = Gauge.build()
            .name("opsfactory_exporter_process_cpu")
            .help("Exporter process CPU load")
            .register(registry);

        this.exporterNodejsHeap = Gauge.build()
            .name("opsfactory_exporter_nodejs_heap")
            .help("Exporter heap used bytes (legacy metric name)")
            .register(registry);

        initializeStatusGauge();
    }

    private void initializeStatusGauge() {
        for (String status : List.of("starting", "running", "stopped", "error")) {
            instancesTotal.labels(status).set(0);
        }
    }

    public synchronized void collect() {
        try {
            Map<String, Object> system = gatewayApi.fetch("/runtime-source/system");
            Map<String, Object> instances = gatewayApi.fetch("/runtime-source/instances");

            gatewayUp.set(1);
            setSystemMetrics(system);
            setInstancesMetrics(instances);
        } catch (Exception ex) {
            log.warn("Failed to collect gateway metrics", ex);
            gatewayUp.set(0);
        }

        updateExporterSelfMetrics();
    }

    public synchronized String renderMetrics() throws IOException {
        StringWriter writer = new StringWriter();
        TextFormat.write004(writer, registry.metricFamilySamples());
        return writer.toString();
    }

    public String metricsContentType() {
        return TextFormat.CONTENT_TYPE_004;
    }

    private Map<String, Object> fetchJson(String path) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
            .uri(URI.create(config.getGatewayUrl() + path))
            .timeout(Duration.ofMillis(config.getCollectTimeoutMs()))
            .header("x-secret-key", config.getGatewaySecretKey())
            .header("x-user-id", "admin")
            .GET()
            .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IOException("Gateway " + path + " returned HTTP " + response.statusCode());
        }

        return Jsons.asMap(response.body());
    }

    @FunctionalInterface
    interface GatewayApi {
        Map<String, Object> fetch(String path) throws IOException, InterruptedException;
    }

    private void setSystemMetrics(Map<String, Object> system) {
        Map<String, Object> gateway = Jsons.asMapSafe(system.get("gateway"));
        Number uptimeMs = Jsons.asNumber(gateway.get("uptimeMs"));
        gatewayUptimeSeconds.set(uptimeMs.doubleValue() / 1000.0);

        Map<String, Object> agents = Jsons.asMapSafe(system.get("agents"));
        Number configured = Jsons.asNumber(agents.get("configured"));
        agentsConfigured.set(configured.doubleValue());

        Map<String, Object> langfuse = Jsons.asMapSafe(system.get("langfuse"));
        boolean configuredFlag = Jsons.asBoolean(langfuse.get("configured"));
        langfuseConfigured.set(configuredFlag ? 1 : 0);
    }

    private void setInstancesMetrics(Map<String, Object> instances) {
        Map<String, Double> statusCounts = new HashMap<>();
        statusCounts.put("starting", 0d);
        statusCounts.put("running", 0d);
        statusCounts.put("stopped", 0d);
        statusCounts.put("error", 0d);

        instanceIdleSeconds.clear();
        instanceInfo.clear();

        long now = System.currentTimeMillis();
        List<Map<String, Object>> byAgent = Jsons.asListOfMaps(instances.get("byAgent"));
        for (Map<String, Object> group : byAgent) {
            String agentId = String.valueOf(group.getOrDefault("agentId", ""));
            List<Map<String, Object>> agentInstances = Jsons.asListOfMaps(group.get("instances"));
            for (Map<String, Object> inst : agentInstances) {
                String status = String.valueOf(inst.getOrDefault("status", "stopped"));
                statusCounts.put(status, statusCounts.getOrDefault(status, 0d) + 1);

                String userId = String.valueOf(inst.getOrDefault("userId", ""));
                String port = String.valueOf(inst.getOrDefault("port", "0"));

                Number lastActivity = Jsons.asNumber(inst.get("lastActivity"));
                double idleSeconds = Math.max(0, (now - lastActivity.doubleValue()) / 1000.0);
                instanceIdleSeconds.labels(agentId, userId).set(idleSeconds);
                instanceInfo.labels(agentId, userId, port, status).set(1);
            }
        }

        instancesTotal.clear();
        for (String status : List.of("starting", "running", "stopped", "error")) {
            instancesTotal.labels(status).set(statusCounts.getOrDefault(status, 0d));
        }
    }

    private void updateExporterSelfMetrics() {
        double cpuLoad = 0;
        try {
            com.sun.management.OperatingSystemMXBean osMxBean =
                (com.sun.management.OperatingSystemMXBean) ManagementFactory.getOperatingSystemMXBean();
            cpuLoad = Math.max(0, osMxBean.getProcessCpuLoad());
        } catch (Exception ignored) {
            // Keep default 0 when not available.
        }
        exporterProcessCpu.set(cpuLoad);

        long heapUsed = ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed();
        exporterNodejsHeap.set(heapUsed);
    }
}
