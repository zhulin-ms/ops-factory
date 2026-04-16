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
public class HostGroupService {

    private static final Logger log = LoggerFactory.getLogger(HostGroupService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final GatewayProperties properties;
    private Path groupsDir;

    public HostGroupService(GatewayProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    public void init() {
        Path gatewayRoot = properties.getGatewayRootPath();
        this.groupsDir = gatewayRoot.resolve("data").resolve("host-groups");
        try {
            Files.createDirectories(groupsDir);
        } catch (IOException e) {
            log.error("Failed to create host-groups directory: {}", groupsDir, e);
        }
        log.info("HostGroupService initialized, groupsDir={}", groupsDir);
    }

    // ── CRUD Operations ──────────────────────────────────────────────

    public List<Map<String, Object>> listGroups() {
        List<Map<String, Object>> groups = new ArrayList<>();
        if (!Files.isDirectory(groupsDir)) {
            return groups;
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(groupsDir, "*.json")) {
            for (Path file : stream) {
                if (!Files.isRegularFile(file)) {
                    continue;
                }
                try {
                    Map<String, Object> group = readFile(file);
                    if (group != null) {
                        groups.add(group);
                    }
                } catch (Exception e) {
                    log.warn("Failed to read group file: {}", file, e);
                }
            }
        } catch (IOException e) {
            log.error("Failed to list groups from {}", groupsDir, e);
        }
        return groups;
    }

    public Map<String, Object> getGroup(String id) {
        Path file = groupsDir.resolve(id + ".json");
        Map<String, Object> group = readFile(file);
        if (group == null) {
            throw new IllegalArgumentException("Host group not found: " + id);
        }
        return group;
    }

    /**
     * Build tree structure: top-level groups → sub-groups → clusters (leaf nodes).
     * Clusters are attached based on their groupId matching a group's id.
     * Business services are attached to their groupId node.
     */
    public Map<String, Object> getTree(List<Map<String, Object>> groups, List<Map<String, Object>> clusters) {
        return getTree(groups, clusters, List.of());
    }

    public Map<String, Object> getTree(List<Map<String, Object>> groups, List<Map<String, Object>> clusters,
                                        List<Map<String, Object>> businessServices) {
        Map<String, String> groupNameMap = new LinkedHashMap<>();
        for (Map<String, Object> g : groups) {
            groupNameMap.put((String) g.get("id"), (String) g.get("name"));
        }

        // Build group nodes with children
        Map<String, Map<String, Object>> groupNodeMap = new LinkedHashMap<>();
        for (Map<String, Object> group : groups) {
            Map<String, Object> node = new LinkedHashMap<>(group);
            node.put("children", new ArrayList<Map<String, Object>>());
            node.put("clusters", new ArrayList<Map<String, Object>>());
            node.put("businessServices", new ArrayList<Map<String, Object>>());
            groupNodeMap.put((String) group.get("id"), node);
        }

        // Attach clusters to their groups
        for (Map<String, Object> cluster : clusters) {
            String groupId = (String) cluster.get("groupId");
            if (groupId != null && groupNodeMap.containsKey(groupId)) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> clusterList = (List<Map<String, Object>>) groupNodeMap.get(groupId).get("clusters");
                clusterList.add(cluster);
            }
        }

        // Attach business services to their groups
        for (Map<String, Object> bs : businessServices) {
            String groupId = (String) bs.get("groupId");
            if (groupId != null && groupNodeMap.containsKey(groupId)) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> bsList = (List<Map<String, Object>>) groupNodeMap.get(groupId).get("businessServices");
                bsList.add(bs);
            }
        }

        // Build hierarchy: top-level groups first, then nest sub-groups
        List<Map<String, Object>> tree = new ArrayList<>();
        for (Map<String, Object> node : groupNodeMap.values()) {
            String parentId = (String) node.get("parentId");
            if (parentId == null) {
                tree.add(node);
            } else {
                Map<String, Object> parent = groupNodeMap.get(parentId);
                if (parent != null) {
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> children = (List<Map<String, Object>>) parent.get("children");
                    children.add(node);
                } else {
                    // Orphan sub-group: add to top level
                    tree.add(node);
                }
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tree", tree);
        return result;
    }

    public Map<String, Object> createGroup(Map<String, Object> body) {
        String id = UUID.randomUUID().toString();
        String now = Instant.now().toString();

        Map<String, Object> group = new LinkedHashMap<>();
        group.put("id", id);
        group.put("name", body.getOrDefault("name", ""));
        group.put("parentId", body.get("parentId"));
        group.put("description", body.getOrDefault("description", ""));
        group.put("createdAt", now);
        group.put("updatedAt", now);

        writeEntityFile(id, group);
        log.info("Created host group: id={}, name={}", id, group.get("name"));
        return group;
    }

    public Map<String, Object> updateGroup(String id, Map<String, Object> body) {
        Path file = groupsDir.resolve(id + ".json");
        Map<String, Object> group = readFile(file);
        if (group == null) {
            throw new IllegalArgumentException("Host group not found: " + id);
        }

        if (body.containsKey("name")) {
            group.put("name", body.get("name"));
        }
        if (body.containsKey("parentId")) {
            group.put("parentId", body.get("parentId"));
        }
        if (body.containsKey("description")) {
            group.put("description", body.get("description"));
        }

        group.put("updatedAt", Instant.now().toString());
        writeEntityFile(id, group);
        log.info("Updated host group: id={}", id);
        return group;
    }

    /**
     * Delete a group. Rejects if the group has sub-groups or clusters.
     * @param clusterService used to check for clusters in this group
     * @return true if deleted
     */
    public boolean deleteGroup(String id, ClusterService clusterService) {
        // Check for sub-groups
        List<Map<String, Object>> allGroups = listGroups();
        for (Map<String, Object> g : allGroups) {
            String parentId = (String) g.get("parentId");
            if (id.equals(parentId)) {
                throw new IllegalStateException("Cannot delete group with sub-groups. Remove sub-groups first.");
            }
        }

        // Check for clusters
        List<Map<String, Object>> clusters = clusterService.listClusters(id, null);
        if (!clusters.isEmpty()) {
            throw new IllegalStateException("Cannot delete group with clusters. Remove clusters first.");
        }

        Path file = groupsDir.resolve(id + ".json");
        try {
            if (Files.exists(file)) {
                Files.delete(file);
                log.info("Deleted host group: id={}", id);
                return true;
            }
            return false;
        } catch (IOException e) {
            log.error("Failed to delete group file: {}", file, e);
            return false;
        }
    }

    /**
     * Force-delete a group with cascade: deletes business services, recursively force-deletes
     * sub-groups, force-deletes clusters (which cascade-delete hosts), then deletes the group.
     */
    public boolean forceDeleteGroup(String id, ClusterService clusterService,
                                     HostService hostService, BusinessServiceService businessServiceService) {
        // 1. Delete business services under this group
        for (Map<String, Object> bs : businessServiceService.listBusinessServices(id, null)) {
            businessServiceService.deleteBusinessService((String) bs.get("id"));
            log.info("Force-deleted business service {} in group {}", bs.get("id"), id);
        }

        // 2. Recursively force-delete sub-groups
        for (Map<String, Object> g : listGroups()) {
            if (id.equals(g.get("parentId"))) {
                forceDeleteGroup((String) g.get("id"), clusterService, hostService, businessServiceService);
            }
        }

        // 3. Force-delete all clusters in this group
        for (Map<String, Object> c : clusterService.listClusters(id, null)) {
            clusterService.forceDeleteCluster((String) c.get("id"), hostService);
        }

        // 4. Delete the group file itself
        Path file = groupsDir.resolve(id + ".json");
        try {
            if (Files.exists(file)) {
                Files.delete(file);
                log.info("Force-deleted host group: id={}", id);
                return true;
            }
            return false;
        } catch (IOException e) {
            log.error("Failed to force-delete group file: {}", file, e);
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
            log.error("Failed to read group file: {}", file, e);
            return null;
        }
    }

    private void writeEntityFile(String id, Map<String, Object> entity) {
        try {
            Files.createDirectories(groupsDir);
            Path file = groupsDir.resolve(id + ".json");
            String json = MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(entity);
            Files.writeString(file, json, StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.error("Failed to write group file for id={}", id, e);
            throw new RuntimeException("Failed to save host group", e);
        }
    }
}
