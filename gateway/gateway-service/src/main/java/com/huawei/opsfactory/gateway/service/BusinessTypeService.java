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
public class BusinessTypeService {

    private static final Logger log = LoggerFactory.getLogger(BusinessTypeService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final GatewayProperties properties;
    private Path businessTypesDir;

    public BusinessTypeService(GatewayProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    public void init() {
        Path gatewayRoot = properties.getGatewayRootPath();
        this.businessTypesDir = gatewayRoot.resolve("data").resolve("business-types");
        try {
            Files.createDirectories(businessTypesDir);
        } catch (IOException e) {
            log.error("Failed to create business-types directory: {}", businessTypesDir, e);
        }
        log.info("BusinessTypeService initialized, businessTypesDir={}", businessTypesDir);
    }

    // ── CRUD Operations ──────────────────────────────────────────────

    public List<Map<String, Object>> listBusinessTypes() {
        List<Map<String, Object>> types = new ArrayList<>();
        if (!Files.isDirectory(businessTypesDir)) {
            return types;
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(businessTypesDir, "*.json")) {
            for (Path file : stream) {
                if (!Files.isRegularFile(file)) {
                    continue;
                }
                try {
                    Map<String, Object> bt = readFile(file);
                    if (bt != null) {
                        types.add(bt);
                    }
                } catch (Exception e) {
                    log.warn("Failed to read business-type file: {}", file, e);
                }
            }
        } catch (IOException e) {
            log.error("Failed to list business-types from {}", businessTypesDir, e);
        }
        return types;
    }

    public Map<String, Object> getBusinessType(String id) {
        Path file = businessTypesDir.resolve(id + ".json");
        Map<String, Object> bt = readFile(file);
        if (bt == null) {
            throw new IllegalArgumentException("Business type not found: " + id);
        }
        return bt;
    }

    public Map<String, Object> createBusinessType(Map<String, Object> body) {
        String id = UUID.randomUUID().toString();
        String now = Instant.now().toString();

        Map<String, Object> bt = new LinkedHashMap<>();
        bt.put("id", id);
        bt.put("name", body.getOrDefault("name", ""));
        bt.put("code", body.getOrDefault("code", ""));
        bt.put("description", body.getOrDefault("description", ""));
        bt.put("color", body.getOrDefault("color", "#6366f1"));
        bt.put("knowledge", body.getOrDefault("knowledge", ""));
        bt.put("createdAt", now);
        bt.put("updatedAt", now);

        writeEntityFile(id, bt);
        log.info("Created business type: id={}, name={}, code={}", id, bt.get("name"), bt.get("code"));
        return bt;
    }

    public Map<String, Object> updateBusinessType(String id, Map<String, Object> body) {
        Path file = businessTypesDir.resolve(id + ".json");
        Map<String, Object> bt = readFile(file);
        if (bt == null) {
            throw new IllegalArgumentException("Business type not found: " + id);
        }

        if (body.containsKey("name")) {
            bt.put("name", body.get("name"));
        }
        if (body.containsKey("code")) {
            bt.put("code", body.get("code"));
        }
        if (body.containsKey("description")) {
            bt.put("description", body.get("description"));
        }
        if (body.containsKey("color")) {
            bt.put("color", body.get("color"));
        }
        if (body.containsKey("knowledge")) {
            bt.put("knowledge", body.get("knowledge"));
        }

        bt.put("updatedAt", Instant.now().toString());
        writeEntityFile(id, bt);
        log.info("Updated business type: id={}", id);
        return bt;
    }

    public boolean deleteBusinessType(String id) {
        Path file = businessTypesDir.resolve(id + ".json");
        try {
            if (Files.exists(file)) {
                Files.delete(file);
                log.info("Deleted business type: id={}", id);
                return true;
            }
            return false;
        } catch (IOException e) {
            log.error("Failed to delete business-type file: {}", file, e);
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
            log.error("Failed to read business-type file: {}", file, e);
            return null;
        }
    }

    private void writeEntityFile(String id, Map<String, Object> entity) {
        try {
            Files.createDirectories(businessTypesDir);
            Path file = businessTypesDir.resolve(id + ".json");
            String json = MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(entity);
            Files.writeString(file, json, StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.error("Failed to write business-type file for id={}", id, e);
            throw new RuntimeException("Failed to save business type", e);
        }
    }
}
