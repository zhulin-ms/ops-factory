package com.huawei.opsfactory.gateway.controller;

import com.huawei.opsfactory.gateway.common.model.ManagedInstance;
import com.huawei.opsfactory.gateway.config.GatewayProperties;
import com.huawei.opsfactory.gateway.filter.UserContextFilter;
import com.huawei.opsfactory.gateway.monitoring.MetricsBuffer;
import com.huawei.opsfactory.gateway.monitoring.MetricsSnapshot;
import com.huawei.opsfactory.gateway.process.InstanceManager;
import com.huawei.opsfactory.gateway.service.AgentConfigService;
import com.huawei.opsfactory.gateway.service.LangfuseService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;

import java.lang.management.ManagementFactory;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/gateway/runtime-source")
public class InternalRuntimeSourceController {

    private final InstanceManager instanceManager;
    private final AgentConfigService agentConfigService;
    private final LangfuseService langfuseService;
    private final GatewayProperties gatewayProperties;
    private final MetricsBuffer metricsBuffer;

    @Value("${server.port:3000}")
    private int serverPort;

    @Value("${server.address:0.0.0.0}")
    private String serverHost;

    public InternalRuntimeSourceController(InstanceManager instanceManager,
                                           AgentConfigService agentConfigService,
                                           LangfuseService langfuseService,
                                           GatewayProperties gatewayProperties,
                                           MetricsBuffer metricsBuffer) {
        this.instanceManager = instanceManager;
        this.agentConfigService = agentConfigService;
        this.langfuseService = langfuseService;
        this.gatewayProperties = gatewayProperties;
        this.metricsBuffer = metricsBuffer;
    }

    @GetMapping("/system")
    public Map<String, Object> system(ServerWebExchange exchange) {
        requireAdmin(exchange);
        long uptimeMs = ManagementFactory.getRuntimeMXBean().getUptime();
        long idleTimeoutMs = gatewayProperties.getIdle().getTimeoutMinutes() * 60_000L;

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("gateway", Map.of(
                "uptimeMs", uptimeMs,
                "uptimeFormatted", formatUptime(uptimeMs),
                "host", serverHost,
                "port", serverPort));
        result.put("agents", Map.of(
                "configured", agentConfigService.getRegistry().size()));
        result.put("idle", Map.of(
                "timeoutMs", idleTimeoutMs,
                "checkIntervalMs", gatewayProperties.getIdle().getCheckIntervalMs()));
        Map<String, Object> langfuse = new LinkedHashMap<>();
        langfuse.put("configured", langfuseService.isConfigured());
        String langfuseHost = gatewayProperties.getLangfuse().getHost();
        langfuse.put("host", (langfuseHost != null && !langfuseHost.isEmpty()) ? langfuseHost : null);
        result.put("langfuse", langfuse);
        return result;
    }

    @GetMapping("/instances")
    public Map<String, Object> instances(ServerWebExchange exchange) {
        requireAdmin(exchange);
        List<ManagedInstance> allInstances = new ArrayList<>(instanceManager.getAllInstances());
        Map<String, List<Map<String, Object>>> grouped = allInstances.stream()
                .collect(Collectors.groupingBy(
                        ManagedInstance::getAgentId,
                        LinkedHashMap::new,
                        Collectors.mapping(instance -> {
                            Map<String, Object> item = new LinkedHashMap<>();
                            item.put("agentId", instance.getAgentId());
                            item.put("userId", instance.getUserId());
                            item.put("port", instance.getPort());
                            item.put("pid", instance.getPid());
                            item.put("status", instance.getStatus().name().toLowerCase());
                            item.put("lastActivity", instance.getLastActivity());
                            item.put("idleSinceMs", System.currentTimeMillis() - instance.getLastActivity());
                            return item;
                        }, Collectors.toList())));

        List<Map<String, Object>> byAgent = new ArrayList<>();
        for (var entry : grouped.entrySet()) {
            Map<String, Object> group = new LinkedHashMap<>();
            group.put("agentId", entry.getKey());
            var registryEntry = agentConfigService.findAgent(entry.getKey());
            group.put("agentName", registryEntry != null ? registryEntry.name() : entry.getKey());
            group.put("instances", entry.getValue());
            byAgent.add(group);
        }

        long running = allInstances.stream()
                .filter(instance -> instance.getStatus() == ManagedInstance.Status.RUNNING)
                .count();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalInstances", allInstances.size());
        result.put("runningInstances", (int) running);
        result.put("byAgent", byAgent);
        return result;
    }

    @GetMapping("/metrics")
    public Map<String, Object> metrics(ServerWebExchange exchange) {
        requireAdmin(exchange);
        List<MetricsSnapshot> snapshots = metricsBuffer.getSnapshots(120);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("collectionIntervalSec", 30);
        result.put("maxSlots", 120);
        result.put("returnedSlots", snapshots.size());

        if (!snapshots.isEmpty()) {
            MetricsSnapshot latest = snapshots.get(snapshots.size() - 1);
            Map<String, Object> current = new LinkedHashMap<>();
            current.put("activeInstances", latest.getActiveInstances());
            current.put("totalTokens", latest.getTotalTokens());
            current.put("totalSessions", latest.getTotalSessions());
            result.put("current", current);
        } else {
            result.put("current", null);
        }

        int totalRequests = 0;
        int totalErrors = 0;
        double weightedLatencySum = 0;
        double weightedTtftSum = 0;
        double tokensPerSecSum = 0;
        int tokensPerSecCount = 0;
        double maxP95Latency = 0;
        double maxP95Ttft = 0;

        for (MetricsSnapshot snapshot : snapshots) {
            totalRequests += snapshot.getRequestCount();
            totalErrors += snapshot.getErrorCount();
            weightedLatencySum += snapshot.getAvgLatencyMs() * snapshot.getRequestCount();
            weightedTtftSum += snapshot.getAvgTtftMs() * snapshot.getRequestCount();
            if (snapshot.getTokensPerSec() > 0) {
                tokensPerSecSum += snapshot.getTokensPerSec();
                tokensPerSecCount++;
            }
            if (snapshot.getP95LatencyMs() > maxP95Latency) maxP95Latency = snapshot.getP95LatencyMs();
            if (snapshot.getP95TtftMs() > maxP95Ttft) maxP95Ttft = snapshot.getP95TtftMs();
        }

        double avgLatency = totalRequests > 0 ? weightedLatencySum / totalRequests : 0;
        double avgTtft = totalRequests > 0 ? weightedTtftSum / totalRequests : 0;
        double avgTokensPerSec = tokensPerSecCount > 0 ? tokensPerSecSum / tokensPerSecCount : 0;

        Map<String, Object> aggregate = new LinkedHashMap<>();
        aggregate.put("totalRequests", totalRequests);
        aggregate.put("totalErrors", totalErrors);
        aggregate.put("avgLatencyMs", Math.round(avgLatency * 100.0) / 100.0);
        aggregate.put("avgTtftMs", Math.round(avgTtft * 100.0) / 100.0);
        aggregate.put("avgTokensPerSec", Math.round(avgTokensPerSec * 100.0) / 100.0);
        aggregate.put("p95LatencyMs", Math.round(maxP95Latency * 100.0) / 100.0);
        aggregate.put("p95TtftMs", Math.round(maxP95Ttft * 100.0) / 100.0);
        result.put("aggregate", aggregate);

        List<Map<String, Object>> series = new ArrayList<>();
        for (MetricsSnapshot snapshot : snapshots) {
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("t", snapshot.getTimestamp());
            point.put("instances", snapshot.getActiveInstances());
            point.put("tokens", snapshot.getTotalTokens());
            point.put("requests", snapshot.getRequestCount());
            point.put("avgLatency", Math.round(snapshot.getAvgLatencyMs() * 100.0) / 100.0);
            point.put("avgTtft", Math.round(snapshot.getAvgTtftMs() * 100.0) / 100.0);
            point.put("p95Latency", Math.round(snapshot.getP95LatencyMs() * 100.0) / 100.0);
            point.put("p95Ttft", Math.round(snapshot.getP95TtftMs() * 100.0) / 100.0);
            point.put("bytes", snapshot.getTotalBytes());
            point.put("errors", snapshot.getErrorCount());
            point.put("tokensPerSec", Math.round(snapshot.getTokensPerSec() * 100.0) / 100.0);
            series.add(point);
        }
        result.put("series", series);
        result.put("agentMetrics", metricsBuffer.getAgentStats());
        return result;
    }

    private static String formatUptime(long ms) {
        long seconds = ms / 1000;
        long days = seconds / 86400;
        long hours = (seconds % 86400) / 3600;
        long minutes = (seconds % 3600) / 60;
        long secs = seconds % 60;
        if (days > 0) return days + "d " + hours + "h " + minutes + "m";
        if (hours > 0) return hours + "h " + minutes + "m";
        return minutes + "m " + secs + "s";
    }

    private void requireAdmin(ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
    }
}
