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
public class HostRelationService {

    private static final Logger log = LoggerFactory.getLogger(HostRelationService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final GatewayProperties properties;
    private final HostService hostService;
    private final ClusterService clusterService;
    private Path relationsDir;

    public HostRelationService(GatewayProperties properties, HostService hostService, ClusterService clusterService) {
        this.properties = properties;
        this.hostService = hostService;
        this.clusterService = clusterService;
    }

    @PostConstruct
    public void init() {
        Path gatewayRoot = properties.getGatewayRootPath();
        this.relationsDir = gatewayRoot.resolve("data").resolve("host-relations");
        try {
            Files.createDirectories(relationsDir);
        } catch (IOException e) {
            log.error("Failed to create host-relations directory: {}", relationsDir, e);
        }
        log.info("HostRelationService initialized, relationsDir={}", relationsDir);
    }

    // ── CRUD Operations ──────────────────────────────────────────────

    /**
     * List relations with optional filters.
     */
    public List<Map<String, Object>> listRelations(String hostId, String groupId, String clusterId) {
        List<Map<String, Object>> relations = new ArrayList<>();
        if (!Files.isDirectory(relationsDir)) {
            return relations;
        }

        // Resolve host IDs for groupId/clusterId filtering
        List<String> targetHostIds = null;
        if ((groupId != null && !groupId.isEmpty()) || (clusterId != null && !clusterId.isEmpty())) {
            targetHostIds = new ArrayList<>();
            if (clusterId != null && !clusterId.isEmpty()) {
                for (Map<String, Object> h : hostService.listHostsByCluster(clusterId)) {
                    targetHostIds.add((String) h.get("id"));
                }
            } else {
                for (Map<String, Object> h : hostService.listHostsByGroup(groupId, clusterService)) {
                    targetHostIds.add((String) h.get("id"));
                }
            }
        }

        try (DirectoryStream<Path> stream = Files.newDirectoryStream(relationsDir, "*.json")) {
            for (Path file : stream) {
                if (!Files.isRegularFile(file)) {
                    continue;
                }
                try {
                    Map<String, Object> rel = readFile(file);
                    if (rel == null) {
                        continue;
                    }
                    // Filter by hostId
                    if (hostId != null && !hostId.isEmpty()) {
                        String sourceId = (String) rel.get("sourceHostId");
                        String targetId = (String) rel.get("targetHostId");
                        if (!hostId.equals(sourceId) && !hostId.equals(targetId)) {
                            continue;
                        }
                    }
                    // Filter by groupId/clusterId
                    if (targetHostIds != null) {
                        String sourceId = (String) rel.get("sourceHostId");
                        String targetId = (String) rel.get("targetHostId");
                        if (!targetHostIds.contains(sourceId) && !targetHostIds.contains(targetId)) {
                            continue;
                        }
                    }
                    relations.add(rel);
                } catch (Exception e) {
                    log.warn("Failed to read relation file: {}", file, e);
                }
            }
        } catch (IOException e) {
            log.error("Failed to list relations from {}", relationsDir, e);
        }
        return relations;
    }

    public Map<String, Object> createRelation(Map<String, Object> body) {
        String sourceHostId = (String) body.get("sourceHostId");
        String targetHostId = (String) body.get("targetHostId");

        // Validate source and target exist
        try {
            hostService.getHost(sourceHostId);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Source host not found: " + sourceHostId);
        }
        try {
            hostService.getHost(targetHostId);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Target host not found: " + targetHostId);
        }

        String id = UUID.randomUUID().toString();
        String now = Instant.now().toString();

        Map<String, Object> relation = new LinkedHashMap<>();
        relation.put("id", id);
        relation.put("sourceHostId", sourceHostId);
        relation.put("targetHostId", targetHostId);
        relation.put("description", body.getOrDefault("description", ""));
        relation.put("createdAt", now);
        relation.put("updatedAt", now);

        writeEntityFile(id, relation);
        log.info("Created host relation: id={}, source={}, target={}", id, sourceHostId, targetHostId);
        return relation;
    }

    public Map<String, Object> updateRelation(String id, Map<String, Object> body) {
        Path file = relationsDir.resolve(id + ".json");
        Map<String, Object> relation = readFile(file);
        if (relation == null) {
            throw new IllegalArgumentException("Host relation not found: " + id);
        }

        if (body.containsKey("description")) {
            relation.put("description", body.get("description"));
        }
        if (body.containsKey("sourceHostId")) {
            String sourceHostId = (String) body.get("sourceHostId");
            try {
                hostService.getHost(sourceHostId);
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("Source host not found: " + sourceHostId);
            }
            relation.put("sourceHostId", sourceHostId);
        }
        if (body.containsKey("targetHostId")) {
            String targetHostId = (String) body.get("targetHostId");
            try {
                hostService.getHost(targetHostId);
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("Target host not found: " + targetHostId);
            }
            relation.put("targetHostId", targetHostId);
        }

        relation.put("updatedAt", Instant.now().toString());
        writeEntityFile(id, relation);
        log.info("Updated host relation: id={}", id);
        return relation;
    }

    public boolean deleteRelation(String id) {
        Path file = relationsDir.resolve(id + ".json");
        try {
            if (Files.exists(file)) {
                Files.delete(file);
                log.info("Deleted host relation: id={}", id);
                return true;
            }
            return false;
        } catch (IOException e) {
            log.error("Failed to delete relation file: {}", file, e);
            return false;
        }
    }

    /**
     * Delete all relations involving a specific host (for cascade delete).
     */
    public void deleteRelationsByHost(String hostId) {
        List<Map<String, Object>> relations = listRelations(hostId, null, null);
        for (Map<String, Object> rel : relations) {
            String relId = (String) rel.get("id");
            deleteRelation(relId);
        }
        if (!relations.isEmpty()) {
            log.info("Cascade deleted {} relations for host {}", relations.size(), hostId);
        }
    }

    /**
     * Build ECharts graph data (nodes + edges) for a given group.
     * Includes all hosts in the group plus any related hosts from other groups.
     */
    public Map<String, Object> getGraphData(String groupId, String clusterId) {
        // Collect hosts in this group or cluster
        List<Map<String, Object>> groupHosts;
        if (clusterId != null && !clusterId.isEmpty()) {
            groupHosts = hostService.listHostsByCluster(clusterId);
        } else if (groupId != null && !groupId.isEmpty()) {
            groupHosts = hostService.listHostsByGroup(groupId, clusterService);
        } else {
            groupHosts = hostService.listHosts(new String[0]);
        }

        Map<String, Map<String, Object>> hostMap = new LinkedHashMap<>();
        for (Map<String, Object> h : groupHosts) {
            hostMap.put((String) h.get("id"), h);
        }

        // Collect outgoing AND incoming relations from these hosts (+1-hop in both directions)
        List<Map<String, Object>> allRelations = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(relationsDir, "*.json")) {
            for (Path file : stream) {
                if (!Files.isRegularFile(file)) continue;
                try {
                    Map<String, Object> rel = readFile(file);
                    if (rel == null) continue;
                    String sourceId = (String) rel.get("sourceHostId");
                    String targetId = (String) rel.get("targetHostId");
                    boolean added = false;
                    // Outgoing: source is in the selected group/cluster → fetch target as +1-hop
                    if (hostMap.containsKey(sourceId)) {
                        allRelations.add(rel);
                        added = true;
                        if (!hostMap.containsKey(targetId)) {
                            try {
                                Map<String, Object> th = hostService.getHost(targetId);
                                hostMap.put(targetId, th);
                            } catch (Exception ignored) {}
                        }
                    }
                    // Incoming: target is in the selected group/cluster → fetch source as +1-hop
                    if (hostMap.containsKey(targetId) && !added) {
                        allRelations.add(rel);
                        if (!hostMap.containsKey(sourceId)) {
                            try {
                                Map<String, Object> sh = hostService.getHost(sourceId);
                                hostMap.put(sourceId, sh);
                            } catch (Exception ignored) {}
                        }
                    }
                } catch (Exception e) {
                    log.warn("Failed to read relation file: {}", file, e);
                }
            }
        } catch (IOException e) {
            log.error("Failed to read relations", e);
        }

        // Build cluster lookup for type info
        Map<String, Map<String, Object>> clusterMap = new LinkedHashMap<>();
        for (Map<String, Object> c : clusterService.listClusters(null, null)) {
            clusterMap.put((String) c.get("id"), c);
        }

        // Build nodes
        List<Map<String, Object>> nodes = new ArrayList<>();
        for (Map<String, Object> h : hostMap.values()) {
            Map<String, Object> node = new LinkedHashMap<>();
            node.put("id", h.get("id"));
            node.put("name", h.get("name"));
            node.put("ip", h.get("ip"));
            String hostClusterId = h.get("clusterId") != null ? h.get("clusterId").toString() : null;
            Map<String, Object> cluster = hostClusterId != null ? clusterMap.get(hostClusterId) : null;
            node.put("clusterType", cluster != null ? cluster.get("type") : null);
            node.put("clusterName", cluster != null ? cluster.get("name") : null);
            node.put("purpose", h.get("purpose"));
            node.put("groupId", cluster != null ? cluster.get("groupId") : null);
            nodes.add(node);
        }

        // Build edges
        List<Map<String, Object>> edges = new ArrayList<>();
        for (Map<String, Object> rel : allRelations) {
            Map<String, Object> edge = new LinkedHashMap<>();
            edge.put("source", rel.get("sourceHostId"));
            edge.put("target", rel.get("targetHostId"));
            edge.put("description", rel.get("description"));
            edges.add(edge);
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("nodes", nodes);
        result.put("edges", edges);
        return result;
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
            log.error("Failed to read relation file: {}", file, e);
            return null;
        }
    }

    private void writeEntityFile(String id, Map<String, Object> entity) {
        try {
            Files.createDirectories(relationsDir);
            Path file = relationsDir.resolve(id + ".json");
            String json = MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(entity);
            Files.writeString(file, json, StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.error("Failed to write relation file for id={}", id, e);
            throw new RuntimeException("Failed to save host relation", e);
        }
    }
}
