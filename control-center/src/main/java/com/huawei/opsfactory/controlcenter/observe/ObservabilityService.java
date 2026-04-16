package com.huawei.opsfactory.controlcenter.observe;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huawei.opsfactory.controlcenter.config.ControlCenterProperties;
import org.springframework.http.HttpHeaders;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

@Service
public class ObservabilityService {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final ControlCenterProperties.Langfuse config;
    private final HttpSupport httpSupport;

    public ObservabilityService(ControlCenterProperties properties, HttpSupport httpSupport) {
        this.config = properties.getLangfuse();
        this.httpSupport = httpSupport;
    }

    public Map<String, Object> getStatus() {
        boolean configured = isConfigured();
        if (!configured) {
            return Map.of("enabled", false);
        }
        boolean reachable = checkReachable();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("enabled", true);
        result.put("reachable", reachable);
        result.put("host", config.getHost());
        return result;
    }

    public Map<String, Object> getOverview(String from, String to) {
        if (!isConfigured()) {
            return emptyOverview();
        }
        try {
            return buildOverview(getTracesRaw(from, to, 500), getObservationsRaw(from, to));
        } catch (Exception e) {
            return emptyOverview();
        }
    }

    public List<Map<String, Object>> getTraces(String from, String to, int limit, boolean errorsOnly) {
        if (!isConfigured()) {
            return List.of();
        }
        try {
            return parseTraces(getTracesRaw(from, to, limit));
        } catch (Exception e) {
            return List.of();
        }
    }

    public Map<String, Object> getObservations(String from, String to) {
        if (!isConfigured()) {
            return Map.of("observations", List.of());
        }
        try {
            return parseObservations(getObservationsRaw(from, to));
        } catch (Exception e) {
            return Map.of("observations", List.of());
        }
    }

    private boolean isConfigured() {
        return config.getHost() != null && !config.getHost().isBlank()
                && config.getPublicKey() != null && !config.getPublicKey().isBlank()
                && config.getSecretKey() != null && !config.getSecretKey().isBlank();
    }

    private boolean checkReachable() {
        try {
            var response = httpSupport.get(config.getHost() + "/api/public/health", authHeaders());
            return response.statusCode() >= 200 && response.statusCode() < 300;
        } catch (Exception e) {
            return false;
        }
    }

    private String getTracesRaw(String from, String to, int limit) throws Exception {
        return doGet(config.getHost() + "/api/public/traces?fromTimestamp=" + from + "&toTimestamp=" + to + "&limit=" + limit);
    }

    private String getObservationsRaw(String from, String to) throws Exception {
        return doGet(config.getHost() + "/api/public/observations?fromTimestamp=" + from + "&toTimestamp=" + to);
    }

    private String doGet(String url) throws Exception {
        var response = httpSupport.get(url, authHeaders());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("Langfuse returned HTTP " + response.statusCode());
        }
        return response.body();
    }

    private HttpHeaders authHeaders() {
        HttpHeaders headers = new HttpHeaders();
        String auth = Base64.getEncoder().encodeToString((config.getPublicKey() + ":" + config.getSecretKey()).getBytes(StandardCharsets.UTF_8));
        headers.set("Authorization", "Basic " + auth);
        return headers;
    }

    private Map<String, Object> buildOverview(String tracesJson, String obsJson) throws Exception {
        JsonNode tracesRoot = MAPPER.readTree(tracesJson);
        JsonNode obsRoot = MAPPER.readTree(obsJson);
        JsonNode traces = tracesRoot.has("data") ? tracesRoot.get("data") : tracesRoot;
        JsonNode obs = obsRoot.has("data") ? obsRoot.get("data") : obsRoot;
        if (!traces.isArray()) traces = MAPPER.createArrayNode();
        if (!obs.isArray()) obs = MAPPER.createArrayNode();

        int totalTraces = traces.size();
        int totalObservations = obs.size();
        double totalCost = 0;
        double sumLatency = 0;
        int errorCount = 0;
        List<Double> latencies = new ArrayList<>();
        TreeMap<String, int[]> dailyMap = new TreeMap<>();

        for (JsonNode trace : traces) {
            double latency = trace.path("latency").asDouble(0);
            latencies.add(latency);
            sumLatency += latency;
            totalCost += trace.path("totalCost").asDouble(0);
            if ("ERROR".equalsIgnoreCase(trace.path("level").asText(""))) {
                errorCount++;
            }
            String timestamp = trace.path("timestamp").asText("");
            if (!timestamp.isEmpty()) {
                try {
                    String date = OffsetDateTime.parse(timestamp).toLocalDate().format(DateTimeFormatter.ISO_LOCAL_DATE);
                    dailyMap.computeIfAbsent(date, key -> new int[]{0, 0})[0]++;
                } catch (Exception ignored) {
                }
            }
        }

        for (JsonNode observation : obs) {
            totalCost += observation.path("totalCost").asDouble(0);
            String timestamp = observation.path("startTime").asText("");
            if (!timestamp.isEmpty()) {
                try {
                    String date = OffsetDateTime.parse(timestamp).toLocalDate().format(DateTimeFormatter.ISO_LOCAL_DATE);
                    dailyMap.computeIfAbsent(date, key -> new int[]{0, 0})[1]++;
                } catch (Exception ignored) {
                }
            }
        }

        List<Map<String, Object>> daily = new ArrayList<>();
        for (var entry : dailyMap.entrySet()) {
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("date", entry.getKey());
            point.put("traces", entry.getValue()[0]);
            point.put("observations", entry.getValue()[1]);
            point.put("cost", 0);
            daily.add(point);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalTraces", totalTraces);
        result.put("totalObservations", totalObservations);
        result.put("totalCost", totalCost);
        result.put("avgLatency", totalTraces > 0 ? sumLatency / totalTraces : 0);
        result.put("p95Latency", computeP95(latencies));
        result.put("errorCount", errorCount);
        result.put("daily", daily);
        return result;
    }

    private List<Map<String, Object>> parseTraces(String json) throws Exception {
        JsonNode root = MAPPER.readTree(json);
        JsonNode data = root.has("data") ? root.get("data") : root;
        if (!data.isArray()) return List.of();

        List<Map<String, Object>> result = new ArrayList<>();
        for (JsonNode trace : data) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", trace.path("id").asText(""));
            row.put("name", trace.path("name").asText(""));
            row.put("timestamp", trace.path("timestamp").asText(""));
            JsonNode inputNode = trace.path("input");
            String input = inputNode.isTextual() ? inputNode.asText()
                    : (inputNode.isMissingNode() || inputNode.isNull()) ? ""
                    : inputNode.toString();
            row.put("input", input);
            row.put("latency", trace.path("latency").asDouble(0));
            row.put("totalCost", trace.path("totalCost").asDouble(0));
            JsonNode obsArray = trace.path("observations");
            row.put("observationCount", obsArray.isArray() ? obsArray.size() : 0);
            boolean hasError = "ERROR".equalsIgnoreCase(trace.path("level").asText(""));
            row.put("hasError", hasError);
            if (hasError) {
                JsonNode output = trace.path("output");
                String errorMessage = output.isTextual() ? output.asText() : trace.path("statusMessage").asText("");
                if (!errorMessage.isEmpty()) {
                    row.put("errorMessage", errorMessage);
                }
            }
            result.add(row);
        }
        return result;
    }

    private Map<String, Object> parseObservations(String json) throws Exception {
        JsonNode root = MAPPER.readTree(json);
        JsonNode data = root.has("data") ? root.get("data") : root;
        if (!data.isArray()) return Map.of("observations", List.of());

        Map<String, List<JsonNode>> groups = new LinkedHashMap<>();
        for (JsonNode observation : data) {
            String name = observation.path("name").asText("unknown");
            groups.computeIfAbsent(name, key -> new ArrayList<>()).add(observation);
        }

        List<Map<String, Object>> items = new ArrayList<>();
        for (var entry : groups.entrySet()) {
            List<Double> latencies = new ArrayList<>();
            double sumLatency = 0;
            long totalTokens = 0;
            double totalCost = 0;
            for (JsonNode observation : entry.getValue()) {
                double latency = observation.path("latency").asDouble(0);
                latencies.add(latency);
                sumLatency += latency;
                totalTokens += observation.path("totalTokens").asLong(
                        observation.path("promptTokens").asLong(0) + observation.path("completionTokens").asLong(0));
                totalCost += observation.path("totalCost").asDouble(0);
            }
            Map<String, Object> group = new LinkedHashMap<>();
            group.put("name", entry.getKey());
            group.put("count", entry.getValue().size());
            group.put("avgLatency", entry.getValue().isEmpty() ? 0 : sumLatency / entry.getValue().size());
            group.put("p95Latency", computeP95(latencies));
            group.put("totalTokens", totalTokens);
            group.put("totalCost", totalCost);
            items.add(group);
        }
        return Map.of("observations", items);
    }

    private static double computeP95(List<Double> latencies) {
        if (latencies.isEmpty()) return 0;
        Collections.sort(latencies);
        int index = (int) Math.ceil(latencies.size() * 0.95) - 1;
        return latencies.get(Math.max(0, index));
    }

    private static Map<String, Object> emptyOverview() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalTraces", 0);
        result.put("totalObservations", 0);
        result.put("totalCost", 0.0);
        result.put("avgLatency", 0.0);
        result.put("p95Latency", 0.0);
        result.put("errorCount", 0);
        result.put("daily", List.of());
        return result;
    }
}
