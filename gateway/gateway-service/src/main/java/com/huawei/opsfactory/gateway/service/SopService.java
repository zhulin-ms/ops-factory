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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class SopService {

    private static final Logger log = LoggerFactory.getLogger(SopService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final GatewayProperties properties;
    private final CommandWhitelistService commandWhitelistService;
    private Path gatewayRoot;
    private Path sopsDir;

    public SopService(GatewayProperties properties, CommandWhitelistService commandWhitelistService) {
        this.properties = properties;
        this.commandWhitelistService = commandWhitelistService;
    }

    @PostConstruct
    public void init() {
        this.gatewayRoot = properties.getGatewayRootPath();
        this.sopsDir = gatewayRoot.resolve("data").resolve("sops");

        try {
            Files.createDirectories(sopsDir);
        } catch (IOException e) {
            log.error("Failed to create SOPs directory: {}", sopsDir, e);
        }

        log.info("SopService initialized, sopsDir={}", sopsDir);
    }

    // ── CRUD Operations ──────────────────────────────────────────────

    public List<Map<String, Object>> listSops() {
        List<Map<String, Object>> sops = new ArrayList<>();
        if (!Files.isDirectory(sopsDir)) {
            return sops;
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(sopsDir, "*.json")) {
            for (Path file : stream) {
                if (!Files.isRegularFile(file)) {
                    continue;
                }
                try {
                    Map<String, Object> sop = readSopFile(file);
                    if (sop != null) {
                        sops.add(sop);
                    }
                } catch (Exception e) {
                    log.warn("Failed to read SOP file: {}", file, e);
                }
            }
        } catch (IOException e) {
            log.error("Failed to list SOPs from {}", sopsDir, e);
        }
        return sops;
    }

    public Map<String, Object> getSop(String id) {
        Path file = resolveSopFile(id);
        Map<String, Object> sop = readSopFile(file);
        if (sop == null) {
            throw new IllegalArgumentException("SOP not found: " + id);
        }
        return sop;
    }

    public Map<String, Object> createSop(Map<String, Object> body) {
        String mode = String.valueOf(body.getOrDefault("mode", "structured"));
        if (!"natural_language".equals(mode)) {
            validateNodeCommands(body);
        }
        String name = body.getOrDefault("name", "") != null ? body.getOrDefault("name", "").toString() : "";
        validateSopNameUnique(name, null);
        String id = UUID.randomUUID().toString();

        Map<String, Object> sop = new LinkedHashMap<>();
        sop.put("id", id);
        sop.put("name", body.getOrDefault("name", ""));
        sop.put("description", body.getOrDefault("description", ""));
        sop.put("version", body.getOrDefault("version", "1.0.0"));
        sop.put("triggerCondition", body.getOrDefault("triggerCondition", ""));
        sop.put("nodes", body.getOrDefault("nodes", List.of()));
        sop.put("enabled", body.getOrDefault("enabled", true));
        sop.put("mode", body.getOrDefault("mode", "structured"));
        sop.put("stepsDescription", body.getOrDefault("stepsDescription", ""));
        sop.put("tags", body.getOrDefault("tags", List.of()));
        sop.put("requiredTools", body.getOrDefault("requiredTools", List.of()));

        writeSopFile(id, sop);
        log.info("Created SOP: id={}, name={}, mode={}", id, sop.get("name"), mode);
        return sop;
    }

    public Map<String, Object> updateSop(String id, Map<String, Object> body) {
        Path file = resolveSopFile(id);
        Map<String, Object> sop = readSopFile(file);
        if (sop == null) {
            throw new IllegalArgumentException("SOP not found: " + id);
        }

        // Determine effective mode for command validation
        String effectiveMode = body.containsKey("mode")
                ? String.valueOf(body.get("mode"))
                : String.valueOf(sop.getOrDefault("mode", "structured"));

        // Update mutable fields
        if (body.containsKey("name")) {
            validateSopNameUnique(body.get("name").toString(), id);
            sop.put("name", body.get("name"));
        }
        if (body.containsKey("description")) {
            sop.put("description", body.get("description"));
        }
        if (body.containsKey("version")) {
            sop.put("version", body.get("version"));
        }
        if (body.containsKey("triggerCondition")) {
            sop.put("triggerCondition", body.get("triggerCondition"));
        }
        if (body.containsKey("nodes")) {
            if (!"natural_language".equals(effectiveMode)) {
                validateNodeCommands(body);
            }
            sop.put("nodes", body.get("nodes"));
        }
        if (body.containsKey("enabled")) {
            sop.put("enabled", body.get("enabled"));
        }
        if (body.containsKey("mode")) {
            sop.put("mode", body.get("mode"));
        }
        if (body.containsKey("stepsDescription")) {
            sop.put("stepsDescription", body.get("stepsDescription"));
        }
        if (body.containsKey("tags")) {
            sop.put("tags", body.get("tags"));
        }
        if (body.containsKey("requiredTools")) {
            sop.put("requiredTools", body.get("requiredTools"));
        }

        writeSopFile(id, sop);
        log.info("Updated SOP: id={}", id);
        return sop;
    }

    public boolean deleteSop(String id) {
        Path file = resolveSopFile(id);
        try {
            if (Files.exists(file)) {
                Files.delete(file);
                log.info("Deleted SOP: id={}", id);
                return true;
            }
            return false;
        } catch (IOException e) {
            log.error("Failed to delete SOP file: {}", file, e);
            return false;
        }
    }

    // ── Name Uniqueness Validation ────────────────────────────────

    private void validateSopNameUnique(String name, String excludeId) {
        if (name == null || name.isBlank()) return;
        List<Map<String, Object>> existing = listSops();
        for (Map<String, Object> sop : existing) {
            String existingName = sop.get("name") != null ? sop.get("name").toString() : "";
            String existingId = sop.get("id") != null ? sop.get("id").toString() : "";
            if (name.equalsIgnoreCase(existingName) && !existingId.equals(excludeId)) {
                throw new IllegalArgumentException("SOP name already exists: " + name);
            }
        }
    }

    // ── Command Whitelist Validation ────────────────────────────────

    @SuppressWarnings("unchecked")
    private void validateNodeCommands(Map<String, Object> body) {
        Object nodesObj = body.get("nodes");
        if (!(nodesObj instanceof List<?> nodes)) return;
        for (int i = 0; i < nodes.size(); i++) {
            if (!(nodes.get(i) instanceof Map<?, ?>)) continue;
            Map<String, Object> node = (Map<String, Object>) nodes.get(i);
            Object cmdObj = node.get("command");
            if (cmdObj == null || cmdObj.toString().isBlank()) continue;
            List<String> rejected = commandWhitelistService.validateCommand(cmdObj.toString());
            if (!rejected.isEmpty()) {
                throw new IllegalArgumentException(
                    "节点 " + (i + 1) + " 命令包含未白名单授权的命令: " + String.join(", ", rejected));
            }
        }
    }

    // ── File I/O Helpers ─────────────────────────────────────────────

    /**
     * Resolve the JSON file path for a given SOP id.
     * Tries direct filename first ({id}.json), then scans all files
     * to match by the internal "id" field (e.g. sub-nslb-{uuid}.json).
     */
    private Path resolveSopFile(String id) {
        // Fast path: direct filename match
        Path direct = sopsDir.resolve(id + ".json");
        if (Files.exists(direct)) {
            return direct;
        }
        // Fallback: scan directory for a file whose internal "id" field matches
        if (Files.isDirectory(sopsDir)) {
            try (DirectoryStream<Path> stream = Files.newDirectoryStream(sopsDir, "*.json")) {
                for (Path file : stream) {
                    if (!Files.isRegularFile(file)) continue;
                    try {
                        Map<String, Object> sop = readSopFile(file);
                        if (sop != null && id.equals(sop.get("id"))) {
                            return file;
                        }
                    } catch (Exception e) {
                        // skip unreadable files
                    }
                }
            } catch (IOException e) {
                log.error("Failed to scan SOPs directory for id={}", id, e);
            }
        }
        // Return the direct path even if not found (caller will handle null)
        return direct;
    }

    private Map<String, Object> readSopFile(Path file) {
        if (!Files.exists(file)) {
            return null;
        }
        try {
            String json = Files.readString(file, StandardCharsets.UTF_8);
            Map<String, Object> sop = MAPPER.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
            // Ensure backward-compatible defaults for new fields
            sop.putIfAbsent("enabled", true);
            sop.putIfAbsent("mode", "structured");
            sop.putIfAbsent("stepsDescription", "");
            sop.putIfAbsent("tags", List.of());
            sop.putIfAbsent("requiredTools", List.of());
            return sop;
        } catch (IOException e) {
            log.error("Failed to read SOP file: {}", file, e);
            return null;
        }
    }

    private void writeSopFile(String id, Map<String, Object> sop) {
        try {
            Files.createDirectories(sopsDir);
            Path file = sopsDir.resolve(id + ".json");
            String json = MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(sop);
            Files.writeString(file, json, StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.error("Failed to write SOP file for id={}", id, e);
            throw new RuntimeException("Failed to save SOP", e);
        }
    }
}
