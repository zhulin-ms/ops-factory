package com.huawei.opsfactory.gateway.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huawei.opsfactory.gateway.config.GatewayProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ClusterTypeService {

    private static final Logger log = LoggerFactory.getLogger(ClusterTypeService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final GatewayProperties properties;
    private Path clusterTypesDir;

    public ClusterTypeService(GatewayProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    public void init() {
        Path gatewayRoot = properties.getGatewayRootPath();
        this.clusterTypesDir = gatewayRoot.resolve("data").resolve("cluster-types");
        try {
            Files.createDirectories(clusterTypesDir);
        } catch (IOException e) {
            log.error("Failed to create cluster-types directory: {}", clusterTypesDir, e);
        }
        log.info("ClusterTypeService initialized, clusterTypesDir={}", clusterTypesDir);
    }

    // ── CRUD Operations ──────────────────────────────────────────────

    public List<Map<String, Object>> listClusterTypes() {
        List<Map<String, Object>> types = new ArrayList<>();
        if (!Files.isDirectory(clusterTypesDir)) {
            return types;
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(clusterTypesDir, "*.json")) {
            for (Path file : stream) {
                if (!Files.isRegularFile(file)) {
                    continue;
                }
                try {
                    Map<String, Object> ct = readFile(file);
                    if (ct != null) {
                        types.add(ct);
                    }
                } catch (Exception e) {
                    log.warn("Failed to read cluster-type file: {}", file, e);
                }
            }
        } catch (IOException e) {
            log.error("Failed to list cluster-types from {}", clusterTypesDir, e);
        }
        return types;
    }

    public Map<String, Object> getClusterType(String id) {
        Path file = clusterTypesDir.resolve(id + ".json");
        Map<String, Object> ct = readFile(file);
        if (ct == null) {
            throw new IllegalArgumentException("Cluster type not found: " + id);
        }
        return ct;
    }

    public Map<String, Object> createClusterType(Map<String, Object> body) {
        String id = UUID.randomUUID().toString();
        String now = Instant.now().toString();

        Map<String, Object> ct = new LinkedHashMap<>();
        ct.put("id", id);
        ct.put("name", body.getOrDefault("name", ""));
        ct.put("code", body.getOrDefault("code", ""));
        ct.put("description", body.getOrDefault("description", ""));
        ct.put("color", body.getOrDefault("color", "#10b981"));
        ct.put("knowledge", body.getOrDefault("knowledge", ""));
        ct.put("createdAt", now);
        ct.put("updatedAt", now);

        writeEntityFile(id, ct);
        log.info("Created cluster type: id={}, name={}, code={}", id, ct.get("name"), ct.get("code"));
        return ct;
    }

    public Map<String, Object> updateClusterType(String id, Map<String, Object> body) {
        Path file = clusterTypesDir.resolve(id + ".json");
        Map<String, Object> ct = readFile(file);
        if (ct == null) {
            throw new IllegalArgumentException("Cluster type not found: " + id);
        }

        if (body.containsKey("name")) {
            ct.put("name", body.get("name"));
        }
        if (body.containsKey("code")) {
            ct.put("code", body.get("code"));
        }
        if (body.containsKey("description")) {
            ct.put("description", body.get("description"));
        }
        if (body.containsKey("color")) {
            ct.put("color", body.get("color"));
        }
        if (body.containsKey("knowledge")) {
            ct.put("knowledge", body.get("knowledge"));
        }

        ct.put("updatedAt", Instant.now().toString());
        writeEntityFile(id, ct);
        log.info("Updated cluster type: id={}", id);
        return ct;
    }

    public boolean deleteClusterType(String id) {
        Path file = clusterTypesDir.resolve(id + ".json");
        try {
            if (Files.exists(file)) {
                Files.delete(file);
                log.info("Deleted cluster type: id={}", id);
                return true;
            }
            return false;
        } catch (IOException e) {
            log.error("Failed to delete cluster-type file: {}", file, e);
            return false;
        }
    }

    // ── File I/O Helpers ─────────────────────────────────────────────

    private Map<String, Object> readFile(Path file) {
        if (!Files.exists(file)) {
            return null;
        }
        try {
            String json = Files.readString(file, StandardCharsets.UTF_8);
            return MAPPER.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (IOException e) {
            log.error("Failed to read cluster-type file: {}", file, e);
            return null;
        }
    }

    private void writeEntityFile(String id, Map<String, Object> entity) {
        try {
            Files.createDirectories(clusterTypesDir);
            Path file = clusterTypesDir.resolve(id + ".json");
            String json = MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(entity);
            Files.writeString(file, json, StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.error("Failed to write cluster-type file for id={}", id, e);
            throw new RuntimeException("Failed to save cluster type", e);
        }
    }
}
