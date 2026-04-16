package com.huawei.opsfactory.controlcenter.control;

import com.huawei.opsfactory.controlcenter.config.ControlCenterProperties;
import com.huawei.opsfactory.controlcenter.registry.ManagedServiceRegistry;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

@Service
public class ManagedServiceFileService {

    private final ManagedServiceRegistry registry;
    private final Path projectRoot;

    public ManagedServiceFileService(ManagedServiceRegistry registry) {
        this.registry = registry;
        Path current = Path.of("").toAbsolutePath().normalize();
        this.projectRoot = current.getFileName() != null && "control-center".equals(current.getFileName().toString())
                ? current.getParent()
                : current;
    }

    public Map<String, Object> readConfig(String serviceId) {
        ControlCenterProperties.ServiceTarget service = registry.require(serviceId);
        Path configPath = configPathFor(serviceId);
        return Map.of(
                "serviceId", serviceId,
                "serviceName", service.getName(),
                "path", relativePath(configPath),
                "content", readFile(configPath)
        );
    }

    public Map<String, Object> writeConfig(String serviceId, String content) {
        ControlCenterProperties.ServiceTarget service = registry.require(serviceId);
        Path configPath = configPathFor(serviceId);
        try {
            backupExistingFile(serviceId, configPath);
            Files.writeString(configPath, content == null ? "" : content, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to write config: " + e.getMessage(), e);
        }
        return Map.of(
                "serviceId", serviceId,
                "serviceName", service.getName(),
                "path", relativePath(configPath),
                "saved", true
        );
    }

    public Map<String, Object> readLogs(String serviceId, int lines) {
        ControlCenterProperties.ServiceTarget service = registry.require(serviceId);
        Path logPath = logPathFor(serviceId);
        return Map.of(
                "serviceId", serviceId,
                "serviceName", service.getName(),
                "path", relativePath(logPath),
                "lines", Math.max(1, lines),
                "content", tailFile(logPath, Math.max(1, lines))
        );
    }

    private Path configPathFor(String serviceId) {
        ControlCenterProperties.ServiceTarget service = registry.require(serviceId);
        if (service.getConfigPath() != null && !service.getConfigPath().isBlank()) {
            return projectRoot.resolve(service.getConfigPath()).normalize();
        }
        return switch (serviceId) {
            case "gateway" -> projectRoot.resolve("gateway").resolve("config.yaml");
            case "knowledge-service" -> projectRoot.resolve("knowledge-service").resolve("config.yaml");
            case "business-intelligence" -> projectRoot.resolve("business-intelligence").resolve("config.yaml");
            default -> throw new IllegalArgumentException("Unsupported managed service: " + serviceId);
        };
    }

    private Path logPathFor(String serviceId) {
        ControlCenterProperties.ServiceTarget service = registry.require(serviceId);
        if (service.getLogPath() != null && !service.getLogPath().isBlank()) {
            return projectRoot.resolve(service.getLogPath()).normalize();
        }
        return switch (serviceId) {
            case "gateway" -> projectRoot.resolve("gateway").resolve("logs").resolve("gateway.log");
            case "knowledge-service" -> projectRoot.resolve("knowledge-service").resolve("logs").resolve("knowledge-service.log");
            case "business-intelligence" -> projectRoot.resolve("business-intelligence").resolve("logs").resolve("business-intelligence.log");
            default -> throw new IllegalArgumentException("Unsupported managed service: " + serviceId);
        };
    }

    private String readFile(Path path) {
        try {
            if (!Files.exists(path)) {
                return "";
            }
            return Files.readString(path, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to read file: " + e.getMessage(), e);
        }
    }

    private String tailFile(Path path, int lines) {
        try {
            if (!Files.exists(path)) {
                return "";
            }
            List<String> allLines = Files.readAllLines(path, StandardCharsets.UTF_8);
            int fromIndex = Math.max(0, allLines.size() - lines);
            return String.join("\n", allLines.subList(fromIndex, allLines.size()));
        } catch (IOException e) {
            throw new IllegalStateException("Failed to read log file: " + e.getMessage(), e);
        }
    }

    private String relativePath(Path path) {
        try {
            return projectRoot.relativize(path.toAbsolutePath().normalize()).toString();
        } catch (Exception ignored) {
            return path.getFileName() != null ? path.getFileName().toString() : path.toString();
        }
    }

    private void backupExistingFile(String serviceId, Path path) throws IOException {
        if (!Files.exists(path)) {
            return;
        }
        Path backupDir = projectRoot.resolve("control-center").resolve("data").resolve("config-backups");
        Files.createDirectories(backupDir);
        String fileName = path.getFileName() != null ? path.getFileName().toString() : "config.yaml";
        String backupName = serviceId + "." + fileName + "." + System.currentTimeMillis() + ".bak";
        Files.copy(path, backupDir.resolve(backupName), StandardCopyOption.REPLACE_EXISTING);
        pruneBackups(backupDir, serviceId + "." + fileName + ".", 5);
    }

    private void pruneBackups(Path backupDir, String prefix, int maxBackups) throws IOException {
        try (Stream<Path> stream = Files.list(backupDir)) {
            List<Path> backups = stream
                    .filter(path -> {
                        String name = path.getFileName() != null ? path.getFileName().toString() : "";
                        return name.startsWith(prefix) && name.endsWith(".bak");
                    })
                    .sorted(Comparator.comparing(Path::getFileName).reversed())
                    .toList();
            for (int i = maxBackups; i < backups.size(); i++) {
                Files.deleteIfExists(backups.get(i));
            }
        }
    }
}
