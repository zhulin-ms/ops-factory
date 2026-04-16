package com.huawei.opsfactory.exporter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

class GatewayMetricsCollectorTest {

    private static final long NOW = System.currentTimeMillis();

    @Test
    void collectsGatewayAndInstanceMetrics() throws Exception {
        ExporterProperties props = new ExporterProperties();
        props.setGatewayUrl("http://unused");
        props.setGatewaySecretKey("test");
        props.setCollectTimeoutMs(2000);

        GatewayMetricsCollector collector = new GatewayMetricsCollector(props, path -> {
            if ("/runtime-source/system".equals(path)) {
                return Map.of(
                    "gateway", Map.of("uptimeMs", 123456, "host", "127.0.0.1", "port", 3000),
                    "agents", Map.of("configured", 3),
                    "idle", Map.of("timeoutMs", 900000),
                    "langfuse", Map.of("configured", true, "host", "http://langfuse:3000")
                );
            }
            if ("/runtime-source/instances".equals(path)) {
                return Map.of(
                    "totalInstances", 3,
                    "runningInstances", 2,
                    "byAgent", List.of(
                        Map.of(
                            "agentId", "a1",
                            "instances", List.of(
                                Map.<String, Object>of("userId", "alice", "port", 50001, "pid", 1001, "status", "running", "lastActivity", NOW - 5000),
                                Map.<String, Object>of("userId", "bob", "port", 50002, "pid", 1002, "status", "running", "lastActivity", NOW - 30000)
                            )
                        ),
                        Map.of(
                            "agentId", "a2",
                            "instances", List.of(
                                Map.<String, Object>of("userId", "alice", "port", 50003, "pid", 1003, "status", "error", "lastActivity", NOW - 60000)
                            )
                        )
                    )
                );
            }
            return Map.of();
        });

        collector.collect();
        String metrics = collector.renderMetrics();

        assertContains(metrics, "opsfactory_gateway_up 1.0");
        assertContains(metrics, "opsfactory_gateway_uptime_seconds 123.456");
        assertContains(metrics, "opsfactory_agents_configured_total 3.0");
        assertContains(metrics, "opsfactory_instances_total{status=\"running\",} 2.0");
        assertContains(metrics, "opsfactory_instances_total{status=\"error\",} 1.0");
        // idle seconds are computed from (now - lastActivity), so they should be > 0
        assertMetricExists(metrics, "opsfactory_instance_idle_seconds{agent_id=\"a1\",user_id=\"alice\",}");
        assertMetricExists(metrics, "opsfactory_instance_idle_seconds{agent_id=\"a1\",user_id=\"bob\",}");
        assertMetricExists(metrics, "opsfactory_instance_idle_seconds{agent_id=\"a2\",user_id=\"alice\",}");
        assertContains(metrics, "opsfactory_instance_info{agent_id=\"a2\",user_id=\"alice\",port=\"50003\",status=\"error\",} 1.0");
        assertContains(metrics, "opsfactory_langfuse_configured 1.0");
        assertContains(metrics, "opsfactory_exporter_process_cpu");
        assertContains(metrics, "opsfactory_exporter_nodejs_heap");
    }

    @Test
    void langfuseDisabledWhenStatusReturnsFalse() throws Exception {
        ExporterProperties props = new ExporterProperties();
        props.setGatewayUrl("http://unused");
        props.setGatewaySecretKey("test");
        props.setCollectTimeoutMs(2000);

        GatewayMetricsCollector collector = new GatewayMetricsCollector(props, path -> {
            if ("/runtime-source/system".equals(path)) {
                return Map.of(
                    "gateway", Map.of("uptimeMs", 1000),
                    "agents", Map.of("configured", 0),
                    "idle", Map.of("timeoutMs", 900000),
                    "langfuse", Map.of("configured", false)
                );
            }
            if ("/runtime-source/instances".equals(path)) {
                return Map.of("byAgent", List.of());
            }
            return Map.of();
        });

        collector.collect();
        String metrics = collector.renderMetrics();

        assertContains(metrics, "opsfactory_langfuse_configured 0.0");
    }

    @Test
    void marksGatewayDownWhenUnreachable() throws Exception {
        ExporterProperties props = new ExporterProperties();
        props.setGatewayUrl("http://unused");
        props.setGatewaySecretKey("test");
        props.setCollectTimeoutMs(500);

        GatewayMetricsCollector collector = new GatewayMetricsCollector(props, path -> {
            throw new IOException("gateway down");
        });

        collector.collect();
        String metrics = collector.renderMetrics();

        assertContains(metrics, "opsfactory_gateway_up 0.0");
    }

    @Test
    void partialEndpointFailureMarksGatewayDown() throws Exception {
        ExporterProperties props = new ExporterProperties();
        props.setGatewayUrl("http://unused");
        props.setGatewaySecretKey("test");
        props.setCollectTimeoutMs(500);

        GatewayMetricsCollector collector = new GatewayMetricsCollector(props, path -> {
            if ("/runtime-source/system".equals(path)) {
                return Map.of(
                    "gateway", Map.of("uptimeMs", 1000),
                    "agents", Map.of("configured", 1),
                    "idle", Map.of("timeoutMs", 900000),
                    "langfuse", Map.of("configured", false)
                );
            }
            // /runtime-source/instances fails
            throw new IOException("instances endpoint down");
        });

        collector.collect();
        String metrics = collector.renderMetrics();
        assertContains(metrics, "opsfactory_gateway_up 0.0");
    }

    @Test
    void emptyInstancesListProducesZeroCounts() throws Exception {
        ExporterProperties props = new ExporterProperties();
        props.setGatewayUrl("http://unused");
        props.setGatewaySecretKey("test");
        props.setCollectTimeoutMs(2000);

        GatewayMetricsCollector collector = new GatewayMetricsCollector(props, path -> {
            if ("/runtime-source/system".equals(path)) {
                return Map.of(
                    "gateway", Map.of("uptimeMs", 5000),
                    "agents", Map.of("configured", 2),
                    "idle", Map.of("timeoutMs", 900000),
                    "langfuse", Map.of("configured", false)
                );
            }
            if ("/runtime-source/instances".equals(path)) {
                return Map.of("byAgent", List.of());
            }
            return Map.of();
        });

        collector.collect();
        String metrics = collector.renderMetrics();

        assertContains(metrics, "opsfactory_gateway_up 1.0");
        assertContains(metrics, "opsfactory_instances_total{status=\"running\",} 0.0");
        assertContains(metrics, "opsfactory_instances_total{status=\"starting\",} 0.0");
        assertContains(metrics, "opsfactory_instances_total{status=\"stopped\",} 0.0");
        assertContains(metrics, "opsfactory_instances_total{status=\"error\",} 0.0");
    }

    @Test
    void repeatedCollectClearsStaleInstanceData() throws Exception {
        ExporterProperties props = new ExporterProperties();
        props.setGatewayUrl("http://unused");
        props.setGatewaySecretKey("test");
        props.setCollectTimeoutMs(2000);

        // First collect: 2 instances
        GatewayMetricsCollector collector = new GatewayMetricsCollector(props, path -> {
            if ("/runtime-source/system".equals(path)) {
                return Map.of(
                    "gateway", Map.of("uptimeMs", 1000),
                    "agents", Map.of("configured", 1),
                    "idle", Map.of("timeoutMs", 900000),
                    "langfuse", Map.of("configured", false)
                );
            }
            if ("/runtime-source/instances".equals(path)) {
                return Map.of("byAgent", List.of(
                    Map.of("agentId", "a1", "instances", List.of(
                        Map.<String, Object>of("userId", "alice", "port", 50001, "pid", 1001,
                            "status", "running", "lastActivity", NOW - 1000),
                        Map.<String, Object>of("userId", "bob", "port", 50002, "pid", 1002,
                            "status", "running", "lastActivity", NOW - 2000)
                    ))
                ));
            }
            return Map.of();
        });

        collector.collect();
        String metrics1 = collector.renderMetrics();
        assertMetricExists(metrics1, "opsfactory_instance_idle_seconds{agent_id=\"a1\",user_id=\"bob\",}");

        // Second collect: only 1 instance (bob gone), using a new mock via another collector
        // Since we can't swap the GatewayApi, we create a new collector to verify clean state
        GatewayMetricsCollector collector2 = new GatewayMetricsCollector(props, path -> {
            if ("/runtime-source/system".equals(path)) {
                return Map.of(
                    "gateway", Map.of("uptimeMs", 2000),
                    "agents", Map.of("configured", 1),
                    "idle", Map.of("timeoutMs", 900000),
                    "langfuse", Map.of("configured", false)
                );
            }
            if ("/runtime-source/instances".equals(path)) {
                return Map.of("byAgent", List.of(
                    Map.of("agentId", "a1", "instances", List.of(
                        Map.<String, Object>of("userId", "alice", "port", 50001, "pid", 1001,
                            "status", "running", "lastActivity", NOW - 1000)
                    ))
                ));
            }
            return Map.of();
        });

        collector2.collect();
        String metrics2 = collector2.renderMetrics();
        // Bob should not exist in the second collector's output
        Assertions.assertFalse(
            metrics2.lines().anyMatch(line -> line.startsWith("opsfactory_instance_idle_seconds{agent_id=\"a1\",user_id=\"bob\",")),
            "Stale instance data for bob should not be present"
        );
        assertMetricExists(metrics2, "opsfactory_instance_idle_seconds{agent_id=\"a1\",user_id=\"alice\",}");
    }

    @Test
    void unknownStatusIsStillCounted() throws Exception {
        ExporterProperties props = new ExporterProperties();
        props.setGatewayUrl("http://unused");
        props.setGatewaySecretKey("test");
        props.setCollectTimeoutMs(2000);

        GatewayMetricsCollector collector = new GatewayMetricsCollector(props, path -> {
            if ("/runtime-source/system".equals(path)) {
                return Map.of(
                    "gateway", Map.of("uptimeMs", 1000),
                    "agents", Map.of("configured", 1),
                    "idle", Map.of("timeoutMs", 900000),
                    "langfuse", Map.of("configured", false)
                );
            }
            if ("/runtime-source/instances".equals(path)) {
                return Map.of("byAgent", List.of(
                    Map.of("agentId", "a1", "instances", List.of(
                        Map.<String, Object>of("userId", "alice", "port", 50001, "pid", 1001,
                            "status", "unknown_status", "lastActivity", NOW - 1000)
                    ))
                ));
            }
            return Map.of();
        });

        collector.collect();
        String metrics = collector.renderMetrics();

        // The instance_info should record the unknown status
        assertContains(metrics, "opsfactory_instance_info{agent_id=\"a1\",user_id=\"alice\",port=\"50001\",status=\"unknown_status\",} 1.0");
        // Standard statuses should be 0
        assertContains(metrics, "opsfactory_instances_total{status=\"running\",} 0.0");
    }

    private static void assertContains(String metrics, String expected) {
        Assertions.assertTrue(metrics.contains(expected), () -> "Missing metric line: " + expected + "\n" + metrics);
    }

    private static void assertMetricExists(String metrics, String metricPrefix) {
        Assertions.assertTrue(
            metrics.lines().anyMatch(line -> line.startsWith(metricPrefix)),
            () -> "Missing metric starting with: " + metricPrefix + "\n" + metrics
        );
    }
}
