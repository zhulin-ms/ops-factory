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
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class ClusterService {

    private static final Logger log = LoggerFactory.getLogger(ClusterService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final GatewayProperties properties;
    private Path clustersDir;

    public ClusterService(GatewayProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    public void init() {
        Path gatewayRoot = properties.getGatewayRootPath();
        this.clustersDir = gatewayRoot.resolve("data").resolve("clusters");
        try {
            Files.createDirectories(clustersDir);
        } catch (IOException e) {
            log.error("Failed to create clusters directory: {}", clustersDir, e);
        }
        log.info("ClusterService initialized, clustersDir={}", clustersDir);
    }

    // ── CRUD Operations ──────────────────────────────────────────────

    /**
     * List clusters with optional filters.
     * @param groupId filter by group ID (null = no filter)
     * @param type filter by cluster type (null = no filter)
     */
    public List<Map<String, Object>> listClusters(String groupId, String type) {
        List<Map<String, Object>> clusters = new ArrayList<>();
        if (!Files.isDirectory(clustersDir)) {
            return clusters;
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(clustersDir, "*.json")) {
            for (Path file : stream) {
                if (!Files.isRegularFile(file)) {
                    continue;
                }
                try {
                    Map<String, Object> cluster = readFile(file);
                    if (cluster == null) {
                        continue;
                    }
                    // Filter by groupId
                    if (groupId != null && !groupId.isEmpty()) {
                        Object cg = cluster.get("groupId");
                        if (!groupId.equals(cg)) {
                            continue;
                        }
                    }
                    // Filter by type
                    if (type != null && !type.isEmpty()) {
                        Object ct = cluster.get("type");
                        if (!type.equalsIgnoreCase(ct != null ? ct.toString() : "")) {
                            continue;
                        }
                    }
                    clusters.add(cluster);
                } catch (Exception e) {
                    log.warn("Failed to read cluster file: {}", file, e);
                }
            }
        } catch (IOException e) {
            log.error("Failed to list clusters from {}", clustersDir, e);
        }
        return clusters;
    }

    public Map<String, Object> getCluster(String id) {
        Path file = clustersDir.resolve(id + ".json");
        Map<String, Object> cluster = readFile(file);
        if (cluster == null) {
            throw new IllegalArgumentException("Cluster not found: " + id);
        }
        return cluster;
    }

    public List<String> getClusterTypes() {
        LinkedHashSet<String> types = new LinkedHashSet<>();
        List<Map<String, Object>> clusters = listClusters(null, null);
        for (Map<String, Object> cluster : clusters) {
            Object type = cluster.get("type");
            if (type != null && !type.toString().isEmpty()) {
                types.add(type.toString());
            }
        }
        return new ArrayList<>(types);
    }

    public Map<String, Object> createCluster(Map<String, Object> body) {
        String id = UUID.randomUUID().toString();
        String now = Instant.now().toString();

        Map<String, Object> cluster = new LinkedHashMap<>();
        cluster.put("id", id);
        cluster.put("name", body.getOrDefault("name", ""));
        cluster.put("type", body.getOrDefault("type", ""));
        cluster.put("purpose", body.getOrDefault("purpose", ""));
        cluster.put("groupId", body.getOrDefault("groupId", null));
        cluster.put("description", body.getOrDefault("description", ""));
        cluster.put("createdAt", now);
        cluster.put("updatedAt", now);

        writeEntityFile(id, cluster);
        log.info("Created cluster: id={}, name={}, type={}", id, cluster.get("name"), cluster.get("type"));
        return cluster;
    }

    public Map<String, Object> updateCluster(String id, Map<String, Object> body) {
        Path file = clustersDir.resolve(id + ".json");
        Map<String, Object> cluster = readFile(file);
        if (cluster == null) {
            throw new IllegalArgumentException("Cluster not found: " + id);
        }

        if (body.containsKey("name")) {
            cluster.put("name", body.get("name"));
        }
        if (body.containsKey("type")) {
            cluster.put("type", body.get("type"));
        }
        if (body.containsKey("purpose")) {
            cluster.put("purpose", body.get("purpose"));
        }
        if (body.containsKey("groupId")) {
            cluster.put("groupId", body.get("groupId"));
        }
        if (body.containsKey("description")) {
            cluster.put("description", body.get("description"));
        }

        cluster.put("updatedAt", Instant.now().toString());
        writeEntityFile(id, cluster);
        log.info("Updated cluster: id={}", id);
        return cluster;
    }

    /**
     * Delete a cluster. Rejects if the cluster has hosts.
     * @param hostService used to check for hosts in this cluster
     * @return true if deleted
     */
    public boolean deleteCluster(String id, HostService hostService) {
        // Check for hosts
        List<Map<String, Object>> hosts = hostService.listHostsByCluster(id);
        if (!hosts.isEmpty()) {
            throw new IllegalStateException("Cannot delete cluster with hosts. Remove hosts first.");
        }

        Path file = clustersDir.resolve(id + ".json");
        try {
            if (Files.exists(file)) {
                Files.delete(file);
                log.info("Deleted cluster: id={}", id);
                return true;
            }
            return false;
        } catch (IOException e) {
            log.error("Failed to delete cluster file: {}", file, e);
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
            log.error("Failed to read cluster file: {}", file, e);
            return null;
        }
    }

    private void writeEntityFile(String id, Map<String, Object> entity) {
        try {
            Files.createDirectories(clustersDir);
            Path file = clustersDir.resolve(id + ".json");
            String json = MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(entity);
            Files.writeString(file, json, StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.error("Failed to write cluster file for id={}", id, e);
            throw new RuntimeException("Failed to save cluster", e);
        }
    }
}
