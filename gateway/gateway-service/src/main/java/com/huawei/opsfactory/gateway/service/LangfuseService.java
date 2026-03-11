package com.huawei.opsfactory.gateway.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huawei.opsfactory.gateway.config.GatewayProperties;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
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
public class LangfuseService {

    private static final Logger log = LogManager.getLogger(LangfuseService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final GatewayProperties.Langfuse config;
    private final WebClient webClient;

    public LangfuseService(GatewayProperties properties) {
        this.config = properties.getLangfuse();
        this.webClient = WebClient.builder()
                .codecs(c -> c.defaultCodecs().maxInMemorySize(10 * 1024 * 1024))
                .build();
    }

    public boolean isConfigured() {
        return config.getHost() != null && !config.getHost().isBlank()
                && config.getPublicKey() != null && !config.getPublicKey().isBlank()
                && config.getSecretKey() != null && !config.getSecretKey().isBlank();
    }

    public Mono<Boolean> checkReachable() {
        if (!isConfigured()) {
            return Mono.just(false);
        }
        String url = config.getHost() + "/api/public/health";
        String auth = Base64.getEncoder().encodeToString(
                (config.getPublicKey() + ":" + config.getSecretKey()).getBytes());
        return webClient.get()
                .uri(url)
                .header("Authorization", "Basic " + auth)
                .retrieve()
                .toBodilessEntity()
                .timeout(Duration.ofSeconds(5))
                .map(response -> response.getStatusCode().is2xxSuccessful())
                .onErrorResume(e -> {
                    log.warn("Langfuse health check failed: {}", e.getMessage());
                    return Mono.just(false);
                });
    }

    public Mono<String> getTraces(String from, String to, int limit, boolean errorsOnly) {
        if (!isConfigured()) {
            return Mono.just("[]");
        }
        String url = config.getHost() + "/api/public/traces?fromTimestamp=" + from
                + "&toTimestamp=" + to + "&limit=" + limit;
        return doGet(url);
    }

    public Mono<String> getObservations(String from, String to) {
        if (!isConfigured()) {
            return Mono.just("[]");
        }
        String url = config.getHost() + "/api/public/observations?fromTimestamp=" + from
                + "&toTimestamp=" + to;
        return doGet(url);
    }

    /**
     * Compute an overview by fetching traces and observations, then aggregating
     * into totals, averages, percentiles, and daily breakdowns.
     */
    public Mono<Map<String, Object>> getOverview(String from, String to) {
        if (!isConfigured()) {
            return Mono.just(emptyOverview());
        }

        Mono<String> tracesMono = getTraces(from, to, 500, false);
        Mono<String> obsMono = getObservations(from, to);

        return Mono.zip(tracesMono, obsMono).map(tuple -> {
            try {
                return buildOverview(tuple.getT1(), tuple.getT2());
            } catch (Exception e) {
                log.error("Failed to build overview: {}", e.getMessage());
                return emptyOverview();
            }
        });
    }

    private Map<String, Object> buildOverview(String tracesJson, String obsJson) throws Exception {
        JsonNode tracesRoot = MAPPER.readTree(tracesJson);
        JsonNode obsRoot = MAPPER.readTree(obsJson);

        // Langfuse API wraps results in "data" array
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
        TreeMap<String, int[]> dailyMap = new TreeMap<>(); // date -> [traces, observations]

        for (JsonNode t : traces) {
            double latency = t.path("latency").asDouble(0);
            latencies.add(latency);
            sumLatency += latency;
            totalCost += t.path("totalCost").asDouble(0);

            // Check error: Langfuse uses "level" field or "status"
            String level = t.path("level").asText("");
            if ("ERROR".equalsIgnoreCase(level)) {
                errorCount++;
            }

            // Daily aggregation by trace timestamp
            String ts = t.path("timestamp").asText("");
            if (!ts.isEmpty()) {
                try {
                    String date = OffsetDateTime.parse(ts).toLocalDate().format(DateTimeFormatter.ISO_LOCAL_DATE);
                    dailyMap.computeIfAbsent(date, k -> new int[]{0, 0})[0]++;
                } catch (Exception ignored) {
                    // skip unparseable timestamps
                }
            }
        }

        for (JsonNode o : obs) {
            totalCost += o.path("totalCost").asDouble(0);
            String ts = o.path("startTime").asText("");
            if (!ts.isEmpty()) {
                try {
                    String date = OffsetDateTime.parse(ts).toLocalDate().format(DateTimeFormatter.ISO_LOCAL_DATE);
                    dailyMap.computeIfAbsent(date, k -> new int[]{0, 0})[1]++;
                } catch (Exception ignored) {
                }
            }
        }

        double avgLatency = totalTraces > 0 ? sumLatency / totalTraces : 0;

        double p95Latency = computeP95(latencies);

        // Build daily array
        List<Map<String, Object>> daily = new ArrayList<>();
        for (var entry : dailyMap.entrySet()) {
            Map<String, Object> day = new LinkedHashMap<>();
            day.put("date", entry.getKey());
            day.put("traces", entry.getValue()[0]);
            day.put("observations", entry.getValue()[1]);
            day.put("cost", 0); // per-day cost not easily available from trace-level data
            daily.add(day);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalTraces", totalTraces);
        result.put("totalObservations", totalObservations);
        result.put("totalCost", totalCost);
        result.put("avgLatency", avgLatency);
        result.put("p95Latency", p95Latency);
        result.put("errorCount", errorCount);
        result.put("daily", daily);
        return result;
    }

    /**
     * Fetch traces and transform into frontend TraceRow[] format.
     */
    public Mono<List<Map<String, Object>>> getTracesFormatted(String from, String to, int limit, boolean errorsOnly) {
        if (!isConfigured()) {
            return Mono.just(List.of());
        }
        return getTraces(from, to, limit, errorsOnly).map(raw -> {
            try {
                return parseTraces(raw);
            } catch (Exception e) {
                log.error("Failed to parse traces: {}", e.getMessage());
                return List.<Map<String, Object>>of();
            }
        });
    }

    private List<Map<String, Object>> parseTraces(String json) throws Exception {
        JsonNode root = MAPPER.readTree(json);
        JsonNode data = root.has("data") ? root.get("data") : root;
        if (!data.isArray()) return List.of();

        List<Map<String, Object>> result = new ArrayList<>();
        for (JsonNode t : data) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", t.path("id").asText(""));
            row.put("name", t.path("name").asText(""));
            row.put("timestamp", t.path("timestamp").asText(""));

            // input: try to get as string, or stringify the JSON
            JsonNode inputNode = t.path("input");
            String input = inputNode.isTextual() ? inputNode.asText()
                    : (inputNode.isMissingNode() || inputNode.isNull()) ? ""
                    : inputNode.toString();
            row.put("input", input);

            row.put("latency", t.path("latency").asDouble(0));
            row.put("totalCost", t.path("totalCost").asDouble(0));

            // observationCount: from observations array length or metadata
            JsonNode obsArray = t.path("observations");
            row.put("observationCount", obsArray.isArray() ? obsArray.size() : 0);

            String level = t.path("level").asText("");
            boolean hasError = "ERROR".equalsIgnoreCase(level);
            row.put("hasError", hasError);
            if (hasError) {
                // Try to extract error message from output or status message
                JsonNode output = t.path("output");
                String errorMsg = output.isTextual() ? output.asText()
                        : t.path("statusMessage").asText("");
                if (!errorMsg.isEmpty()) {
                    row.put("errorMessage", errorMsg);
                }
            }
            result.add(row);
        }
        return result;
    }

    /**
     * Fetch observations and transform into frontend { observations: ObservationGroup[] } format.
     */
    public Mono<Map<String, Object>> getObservationsFormatted(String from, String to) {
        if (!isConfigured()) {
            return Mono.just(Map.of("observations", List.of()));
        }
        return getObservations(from, to).map(raw -> {
            try {
                return parseObservations(raw);
            } catch (Exception e) {
                log.error("Failed to parse observations: {}", e.getMessage());
                return Map.<String, Object>of("observations", List.of());
            }
        });
    }

    private Map<String, Object> parseObservations(String json) throws Exception {
        JsonNode root = MAPPER.readTree(json);
        JsonNode data = root.has("data") ? root.get("data") : root;
        if (!data.isArray()) return Map.of("observations", List.of());

        // Group by observation name
        Map<String, List<JsonNode>> groups = new LinkedHashMap<>();
        for (JsonNode o : data) {
            String name = o.path("name").asText("unknown");
            groups.computeIfAbsent(name, k -> new ArrayList<>()).add(o);
        }

        List<Map<String, Object>> obsGroups = new ArrayList<>();
        for (var entry : groups.entrySet()) {
            List<JsonNode> items = entry.getValue();
            int count = items.size();
            double sumLatency = 0;
            long totalTokens = 0;
            double totalCost = 0;
            List<Double> latencies = new ArrayList<>();

            for (JsonNode o : items) {
                double lat = o.path("latency").asDouble(0);
                latencies.add(lat);
                sumLatency += lat;
                totalTokens += o.path("totalTokens").asLong(
                        o.path("promptTokens").asLong(0) + o.path("completionTokens").asLong(0));
                totalCost += o.path("totalCost").asDouble(0);
            }

            double avgLatency = count > 0 ? sumLatency / count : 0;
            double p95Latency = computeP95(latencies);

            Map<String, Object> group = new LinkedHashMap<>();
            group.put("name", entry.getKey());
            group.put("count", count);
            group.put("avgLatency", avgLatency);
            group.put("p95Latency", p95Latency);
            group.put("totalTokens", totalTokens);
            group.put("totalCost", totalCost);
            obsGroups.add(group);
        }

        return Map.of("observations", obsGroups);
    }

    private static double computeP95(List<Double> latencies) {
        if (latencies.isEmpty()) return 0;
        Collections.sort(latencies);
        int idx = (int) Math.ceil(latencies.size() * 0.95) - 1;
        return latencies.get(Math.max(0, idx));
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

    private Mono<String> doGet(String url) {
        String auth = Base64.getEncoder().encodeToString(
                (config.getPublicKey() + ":" + config.getSecretKey()).getBytes());
        return webClient.get()
                .uri(url)
                .header("Authorization", "Basic " + auth)
                .retrieve()
                .bodyToMono(String.class)
                .timeout(Duration.ofSeconds(15))
                .onErrorResume(e -> {
                    log.error("Langfuse API error: {}", e.getMessage());
                    return Mono.just("[]");
                });
    }
}
