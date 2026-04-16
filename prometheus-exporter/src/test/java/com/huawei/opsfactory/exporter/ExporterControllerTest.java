package com.huawei.opsfactory.exporter;

import java.io.IOException;
import java.util.Map;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class ExporterControllerTest {

    @Test
    void metricsReturnsPrometheusTextOnSuccess() {
        ExporterProperties props = new ExporterProperties();
        props.setGatewayUrl("http://unused");
        props.setGatewaySecretKey("test");
        props.setCollectTimeoutMs(500);

        // Use a mock that returns minimal valid data
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
                return Map.of("byAgent", java.util.List.of());
            }
            return Map.of();
        });

        ExporterController controller = new ExporterController(collector);
        ResponseEntity<String> response = controller.metrics();

        Assertions.assertEquals(HttpStatus.OK, response.getStatusCode());
        Assertions.assertNotNull(response.getHeaders().getContentType());
        String contentType = response.getHeaders().getContentType().toString();
        Assertions.assertTrue(contentType.contains("text/plain"));
        Assertions.assertNotNull(response.getBody());
        Assertions.assertTrue(response.getBody().contains("opsfactory_gateway_up"));
    }

    @Test
    void metricsReturns500WhenCollectorThrowsIOException() {
        // Create a collector that will throw IOException on renderMetrics
        ExporterProperties props = new ExporterProperties();
        props.setGatewayUrl("http://unused");
        props.setGatewaySecretKey("test");
        props.setCollectTimeoutMs(500);

        GatewayMetricsCollector collector = new GatewayMetricsCollector(props, path -> {
            return Map.of();
        }) {
            @Override
            public synchronized String renderMetrics() throws IOException {
                throw new IOException("simulated render failure");
            }
        };

        ExporterController controller = new ExporterController(collector);
        ResponseEntity<String> response = controller.metrics();

        Assertions.assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
        Assertions.assertNotNull(response.getBody());
        Assertions.assertTrue(response.getBody().contains("simulated render failure"));
    }

    @Test
    void healthReturnsOk() {
        ExporterProperties props = new ExporterProperties();
        props.setGatewayUrl("http://unused");
        props.setGatewaySecretKey("test");
        GatewayMetricsCollector collector = new GatewayMetricsCollector(props, path -> Map.of());
        ExporterController controller = new ExporterController(collector);

        Map<String, String> result = controller.health();
        Assertions.assertEquals("ok", result.get("status"));
    }

    @Test
    void homeReturnsHtmlWithMetricsLink() {
        ExporterProperties props = new ExporterProperties();
        props.setGatewayUrl("http://unused");
        props.setGatewaySecretKey("test");
        GatewayMetricsCollector collector = new GatewayMetricsCollector(props, path -> Map.of());
        ExporterController controller = new ExporterController(collector);

        String html = controller.home();
        Assertions.assertTrue(html.contains("/metrics"));
        Assertions.assertTrue(html.contains("Prometheus Exporter"));
    }
}
