package com.huawei.opsfactory.knowledge.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huawei.opsfactory.knowledge.config.KnowledgeProperties;
import com.huawei.opsfactory.knowledge.repository.EmbeddingRepository;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class EmbeddingService {

    private static final Pattern WORD_PATTERN = Pattern.compile("[\\p{L}\\p{N}]+");
    private static final Pattern HAN_PATTERN = Pattern.compile("\\p{IsHan}+");
    private static final String DEFAULT_PLACEHOLDER_KEY = "sk-or-v1-xxx";
    private static final int MAX_LOCAL_DIMENSIONS = 1024;

    private final KnowledgeProperties properties;
    private final EmbeddingRepository embeddingRepository;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public EmbeddingService(
        KnowledgeProperties properties,
        EmbeddingRepository embeddingRepository,
        ObjectMapper objectMapper
    ) {
        this.properties = properties;
        this.embeddingRepository = embeddingRepository;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofMillis(properties.getEmbedding().getTimeoutMs()))
            .build();
    }

    public Map<String, List<Double>> ensureChunkEmbeddings(Collection<SearchService.SearchableChunk> chunks) {
        if (chunks == null || chunks.isEmpty()) {
            return Map.of();
        }

        Map<String, SearchService.SearchableChunk> chunkMap = chunks.stream()
            .collect(LinkedHashMap::new, (map, chunk) -> map.put(chunk.id(), chunk), Map::putAll);
        Map<String, String> contentHashByChunkId = new LinkedHashMap<>();
        chunkMap.forEach((chunkId, chunk) -> contentHashByChunkId.put(chunkId, embeddingHash(buildChunkEmbeddingText(chunk))));

        int expectedDimension = expectedEmbeddingDimension();
        String model = properties.getEmbedding().getModel();
        Map<String, EmbeddingRepository.EmbeddingRecord> existing = embeddingRepository.findByContentHashes(
            model,
            expectedDimension,
            contentHashByChunkId.values()
        );
        Map<String, List<Double>> resolved = new LinkedHashMap<>();
        List<SearchService.SearchableChunk> missing = new ArrayList<>();

        chunkMap.forEach((chunkId, chunk) -> {
            String expectedHash = contentHashByChunkId.get(chunkId);
            EmbeddingRepository.EmbeddingRecord record = existing.get(expectedHash);
            if (record != null
                && expectedHash.equals(record.contentHash())
                && model.equals(record.model())
                && expectedDimension == record.dimension()
            ) {
                resolved.put(chunkId, record.vector());
            } else {
                missing.add(chunk);
            }
        });

        if (!missing.isEmpty()) {
            List<String> inputs = missing.stream().map(this::buildChunkEmbeddingText).toList();
            List<List<Double>> vectors = embed(inputs);
            for (int index = 0; index < missing.size(); index++) {
                SearchService.SearchableChunk chunk = missing.get(index);
                List<Double> vector = vectors.get(index);
                embeddingRepository.upsert(
                    contentHashByChunkId.get(chunk.id()),
                    model,
                    expectedDimension,
                    vector
                );
                resolved.put(chunk.id(), vector);
            }
        }

        return resolved;
    }

    public List<Double> embedQuery(String query) {
        return embed(List.of(query)).getFirst();
    }

    public String buildChunkEmbeddingText(SearchService.SearchableChunk chunk) {
        List<String> sections = new ArrayList<>();
        if (StringUtils.hasText(chunk.title())) {
            sections.add(chunk.title());
        }
        if (chunk.titlePath() != null && !chunk.titlePath().isEmpty()) {
            sections.add(String.join(" / ", chunk.titlePath()));
        }
        if (chunk.keywords() != null && !chunk.keywords().isEmpty()) {
            sections.add(String.join(" ", chunk.keywords()));
        }
        if (StringUtils.hasText(chunk.text())) {
            sections.add(chunk.text());
        }
        return String.join("\n", sections);
    }

    private List<List<Double>> embed(List<String> inputs) {
        if (!isRemoteEmbeddingEnabled()) {
            return inputs.stream().map(this::localEmbedding).toList();
        }

        try {
            return remoteEmbeddings(inputs);
        } catch (Exception ex) {
            return inputs.stream().map(this::localEmbedding).toList();
        }
    }

    private boolean isRemoteEmbeddingEnabled() {
        String apiKey = properties.getEmbedding().getApiKey();
        String baseUrl = properties.getEmbedding().getBaseUrl();
        return StringUtils.hasText(apiKey)
            && !DEFAULT_PLACEHOLDER_KEY.equals(apiKey)
            && StringUtils.hasText(baseUrl);
    }

    private List<List<Double>> remoteEmbeddings(List<String> inputs) throws Exception {
        URI endpoint = URI.create(resolveEmbeddingsEndpoint(properties.getEmbedding().getBaseUrl()));
        Map<String, Object> body = Map.of(
            "model", properties.getEmbedding().getModel(),
            "dimensions", expectedEmbeddingDimension(),
            "input", inputs
        );
        HttpRequest request = HttpRequest.newBuilder(endpoint)
            .header("Authorization", "Bearer " + properties.getEmbedding().getApiKey())
            .header("Content-Type", "application/json")
            .timeout(Duration.ofMillis(properties.getEmbedding().getTimeoutMs()))
            .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(body)))
            .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException("Embedding request failed with status " + response.statusCode() + ": " + response.body());
        }

        JsonNode json = objectMapper.readTree(response.body());
        JsonNode data = json.path("data");
        if (!data.isArray() || data.size() != inputs.size()) {
            throw new IllegalStateException("Embedding response size mismatch");
        }

        List<List<Double>> vectors = new ArrayList<>(inputs.size());
        for (JsonNode item : data) {
            JsonNode embedding = item.path("embedding");
            if (!embedding.isArray()) {
                throw new IllegalStateException("Embedding response missing embedding array");
            }
            List<Double> vector = new ArrayList<>(embedding.size());
            embedding.forEach(value -> vector.add(value.asDouble()));
            vectors.add(vector);
        }
        return vectors;
    }

    private String resolveEmbeddingsEndpoint(String baseUrl) {
        String normalized = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        if (normalized.endsWith("/embeddings")) {
            return normalized;
        }
        return normalized + "/embeddings";
    }

    private List<Double> localEmbedding(String input) {
        int dimension = expectedEmbeddingDimension();
        double[] vector = new double[dimension];

        for (String token : tokenize(input)) {
            int index = Math.floorMod(token.hashCode(), dimension);
            vector[index] += 1.0;
        }

        double norm = 0;
        for (double value : vector) {
            norm += value * value;
        }

        if (norm == 0) {
            return List.of();
        }

        double scale = Math.sqrt(norm);
        List<Double> normalized = new ArrayList<>(dimension);
        for (double value : vector) {
            normalized.add(value / scale);
        }
        return normalized;
    }

    public int expectedEmbeddingDimension() {
        return Math.max(64, Math.min(properties.getEmbedding().getDimensions(), MAX_LOCAL_DIMENSIONS));
    }

    private List<String> tokenize(String input) {
        String normalized = input == null ? "" : input.toLowerCase(Locale.ROOT);
        List<String> tokens = new ArrayList<>();

        Matcher wordMatcher = WORD_PATTERN.matcher(normalized);
        while (wordMatcher.find()) {
            tokens.add(wordMatcher.group());
        }

        Matcher hanMatcher = HAN_PATTERN.matcher(normalized);
        while (hanMatcher.find()) {
            String run = hanMatcher.group();
            if (run.isBlank()) {
                continue;
            }
            if (run.length() == 1) {
                tokens.add(run);
                continue;
            }
            for (int index = 0; index < run.length() - 1; index++) {
                tokens.add(run.substring(index, index + 2));
            }
        }

        return tokens;
    }

    private String embeddingHash(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest((value == null ? "" : value).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("Failed to hash embedding payload", e);
        }
    }
}
