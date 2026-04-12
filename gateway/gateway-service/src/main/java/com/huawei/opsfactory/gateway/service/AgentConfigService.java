package com.huawei.opsfactory.gateway.service;

import com.huawei.opsfactory.gateway.common.model.AgentRegistryEntry;
import com.huawei.opsfactory.gateway.common.model.ManagedInstance;
import com.huawei.opsfactory.gateway.common.model.ResidentInstanceTarget;
import com.huawei.opsfactory.gateway.common.util.FileUtil;
import com.huawei.opsfactory.gateway.common.util.YamlLoader;
import com.huawei.opsfactory.gateway.config.GatewayProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.error.YAMLException;

import com.fasterxml.jackson.databind.ObjectMapper;
import javax.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
public class AgentConfigService {

    private static final Logger log = LoggerFactory.getLogger(AgentConfigService.class);

    private final GatewayProperties properties;
    private final CopyOnWriteArrayList<AgentRegistryEntry> registry = new CopyOnWriteArrayList<>();
    private final CopyOnWriteArrayList<ResidentInstanceTarget> residentInstances = new CopyOnWriteArrayList<>();
    private final ConcurrentHashMap<String, Map<String, Object>> configCache = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Map<String, Object>> secretsCache = new ConcurrentHashMap<>();
    private final Set<String> residentInstanceKeys = ConcurrentHashMap.newKeySet();
    private Path gatewayRoot;

    public AgentConfigService(GatewayProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    public void loadRegistry() {
        registry.clear();
        residentInstances.clear();
        residentInstanceKeys.clear();

        this.gatewayRoot = properties.getGatewayRootPath();
        Path configYaml = gatewayRoot.resolve("config.yaml");
        Map<String, Object> data = YamlLoader.load(configYaml);

        Object agentsObj = data.get("agents");
        if (agentsObj instanceof List<?> agentsList) {
            for (Object item : agentsList) {
                if (item instanceof Map<?, ?> rawMap) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> map = (Map<String, Object>) rawMap;
                    boolean enabled = !Boolean.FALSE.equals(map.get("enabled"));
                    if (!enabled) {
                        log.info("Skipping disabled agent: {}", map.get("id"));
                        continue;
                    }
                    String id = YamlLoader.getString(map, "id", "");
                    String name = YamlLoader.getString(map, "name", "");
                    registry.add(new AgentRegistryEntry(id, name));
                }
            }
        }
        loadResidentInstances(data);
        log.info("Loaded {} agents from registry", registry.size());
        log.info("Loaded {} resident instance targets", residentInstances.size());
    }

    public List<AgentRegistryEntry> getRegistry() {
        return Collections.unmodifiableList(registry);
    }

    public List<ResidentInstanceTarget> getResidentInstances() {
        return Collections.unmodifiableList(residentInstances);
    }

    public boolean isResidentInstance(String agentId, String userId) {
        return residentInstanceKeys.contains(ManagedInstance.buildKey(agentId, userId));
    }

    public AgentRegistryEntry findAgent(String agentId) {
        for (AgentRegistryEntry entry : registry) {
            if (entry.id().equals(agentId)) {
                return entry;
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private void loadResidentInstances(Map<String, Object> data) {
        Object residentObj = data.get("residentInstances");
        if (!(residentObj instanceof Map<?, ?> residentMapObj)) {
            return;
        }
        Map<String, Object> residentMap = (Map<String, Object>) residentMapObj;
        if (Boolean.FALSE.equals(residentMap.get("enabled"))) {
            return;
        }

        Object entriesObj = residentMap.get("entries");
        if (!(entriesObj instanceof List<?> entries)) {
            return;
        }

        List<String> configuredAgentIds = registry.stream().map(AgentRegistryEntry::id).toList();
        for (Object entryObj : entries) {
            if (!(entryObj instanceof Map<?, ?> rawEntry)) {
                continue;
            }
            Map<String, Object> entry = (Map<String, Object>) rawEntry;
            String userId = YamlLoader.getString(entry, "userId", "").trim();
            if (userId.isEmpty()) {
                log.warn("Skipping residentInstances entry with blank userId");
                continue;
            }
            Object agentIdsObj = entry.get("agentIds");
            if (!(agentIdsObj instanceof List<?> rawAgentIds) || rawAgentIds.isEmpty()) {
                log.warn("Skipping residentInstances entry for user {} without agentIds", userId);
                continue;
            }

            List<String> agentIds = rawAgentIds.stream()
                    .filter(String.class::isInstance)
                    .map(String.class::cast)
                    .map(String::trim)
                    .filter(id -> !id.isEmpty())
                    .toList();
            if (agentIds.contains("*")) {
                addResidentTargets(userId, configuredAgentIds);
                continue;
            }
            List<String> validAgentIds = agentIds.stream()
                    .filter(agentId -> {
                        boolean exists = configuredAgentIds.contains(agentId);
                        if (!exists) {
                            log.warn("Skipping unknown resident agent {} for user {}", agentId, userId);
                        }
                        return exists;
                    })
                    .toList();
            addResidentTargets(userId, validAgentIds);
        }
    }

    private void addResidentTargets(String userId, List<String> agentIds) {
        for (String agentId : agentIds) {
            String key = ManagedInstance.buildKey(agentId, userId);
            if (!residentInstanceKeys.add(key)) {
                continue;
            }
            residentInstances.add(new ResidentInstanceTarget(userId, agentId));
        }
    }

    /**
     * Load the agent's config.yaml as a Map (cached).
     */
    public Map<String, Object> loadAgentConfigYaml(String agentId) {
        return configCache.computeIfAbsent(agentId, id -> {
            Path configPath = getAgentConfigDir(id).resolve("config.yaml");
            return YamlLoader.load(configPath);
        });
    }

    /**
     * Load the agent's secrets.yaml as a Map (cached).
     */
    public Map<String, Object> loadAgentSecretsYaml(String agentId) {
        return secretsCache.computeIfAbsent(agentId, id -> {
            Path secretsPath = getAgentConfigDir(id).resolve("secrets.yaml");
            return YamlLoader.load(secretsPath);
        });
    }

    /**
     * Invalidate cached config/secrets for an agent.
     */
    public void invalidateCache(String agentId) {
        configCache.remove(agentId);
        secretsCache.remove(agentId);
    }

    /**
     * List skills for an agent, parsing SKILL.md frontmatter for metadata.
     */
    public List<Map<String, String>> listSkills(String agentId) {
        Path skillsDir = getAgentConfigDir(agentId).resolve("skills");
        List<Map<String, String>> skills = new ArrayList<>();
        if (!Files.isDirectory(skillsDir)) {
            return skills;
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(skillsDir)) {
            for (Path entry : stream) {
                if (Files.isDirectory(entry)) {
                    String dirName = entry.getFileName().toString();
                    Map<String, String> skill = new HashMap<>();
                    skill.put("name", dirName);
                    skill.put("description", "");
                    skill.put("path", "skills/" + dirName);

                    // Parse SKILL.md YAML frontmatter for name/description
                    Path skillMd = entry.resolve("SKILL.md");
                    if (Files.exists(skillMd)) {
                        try {
                            Map<String, String> frontmatter = parseMarkdownFrontmatter(skillMd);
                            if (frontmatter.containsKey("name")) {
                                skill.put("name", frontmatter.get("name"));
                            }
                            if (frontmatter.containsKey("description")) {
                                skill.put("description", frontmatter.get("description"));
                            }
                        } catch (Exception e) {
                            log.warn("Failed to parse SKILL.md for skill {}/{}", agentId, dirName, e);
                        }
                    }
                    skills.add(skill);
                }
            }
        } catch (IOException e) {
            log.error("Failed to list skills for {}", agentId, e);
        }
        return skills;
    }

    /**
     * Parse YAML frontmatter (between --- delimiters) from a Markdown file.
     */
    private Map<String, String> parseMarkdownFrontmatter(Path mdPath) throws IOException {
        Map<String, String> result = new HashMap<>();
        String content = Files.readString(mdPath);
        if (!content.startsWith("---")) {
            return result;
        }
        int endIndex = content.indexOf("---", 3);
        if (endIndex < 0) {
            return result;
        }
        String yamlBlock = content.substring(3, endIndex).trim();
        org.yaml.snakeyaml.Yaml yaml = new org.yaml.snakeyaml.Yaml();
        Object parsed;
        try {
            parsed = yaml.load(yamlBlock);
        } catch (YAMLException e) {
            log.warn("Invalid YAML frontmatter in {}: {}", mdPath, e.getMessage());
            return result;
        }
        if (parsed instanceof Map<?, ?> map) {
            for (Map.Entry<?, ?> e : map.entrySet()) {
                if (e.getKey() != null && e.getValue() != null) {
                    result.put(e.getKey().toString(), e.getValue().toString());
                }
            }
        }
        return result;
    }

    /**
     * Read AGENTS.md content for an agent.
     */
    public String readAgentsMd(String agentId) {
        Path mdPath = getAgentsDir().resolve(agentId).resolve("AGENTS.md");
        if (!Files.exists(mdPath)) {
            return "";
        }
        try {
            return Files.readString(mdPath);
        } catch (IOException e) {
            log.error("Failed to read AGENTS.md for {}", agentId, e);
            return "";
        }
    }

    /**
     * Write AGENTS.md content for an agent.
     */
    public void writeAgentsMd(String agentId, String content) throws IOException {
        Path mdPath = getAgentsDir().resolve(agentId).resolve("AGENTS.md");
        Files.writeString(mdPath, content);
    }

    // ── Memory file management ──────────────────────────────────────────

    private static final int MAX_MEMORY_CONTENT_SIZE = 100 * 1024; // 100KB

    /**
     * List all memory files (*.txt) for an agent, returning category name + content.
     */
    public List<Map<String, String>> listMemoryFiles(String agentId) {
        Path memoryDir = getAgentConfigDir(agentId).resolve("memory");
        List<Map<String, String>> files = new ArrayList<>();
        if (!Files.isDirectory(memoryDir)) {
            return files;
        }
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(memoryDir, "*.txt")) {
            for (Path entry : stream) {
                if (Files.isRegularFile(entry)) {
                    String fileName = entry.getFileName().toString();
                    String category = fileName.substring(0, fileName.length() - 4); // strip .txt
                    Map<String, String> file = new HashMap<>();
                    file.put("category", category);
                    try {
                        file.put("content", Files.readString(entry));
                    } catch (IOException e) {
                        log.warn("Failed to read memory file {}/{}", agentId, fileName, e);
                        file.put("content", "");
                    }
                    files.add(file);
                }
            }
        } catch (IOException e) {
            log.error("Failed to list memory files for {}", agentId, e);
        }
        return files;
    }

    /**
     * Read a single memory file content.
     */
    public String readMemoryFile(String agentId, String category) {
        Path filePath = getAgentConfigDir(agentId).resolve("memory").resolve(category + ".txt");
        try {
            return Files.readString(filePath);
        } catch (java.nio.file.NoSuchFileException e) {
            return null;
        } catch (IOException e) {
            log.error("Failed to read memory file {}/{}", agentId, category, e);
            return null;
        }
    }

    /**
     * Write (create/update) a memory file. Creates the memory directory if needed.
     */
    public void writeMemoryFile(String agentId, String category, String content) throws IOException {
        if (content != null && content.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > MAX_MEMORY_CONTENT_SIZE) {
            throw new IllegalArgumentException("Memory file content exceeds maximum size of 100KB");
        }
        Path memoryDir = getAgentConfigDir(agentId).resolve("memory");
        Files.createDirectories(memoryDir);
        Files.writeString(memoryDir.resolve(category + ".txt"), content != null ? content : "");
    }

    /**
     * Delete a memory file.
     */
    public void deleteMemoryFile(String agentId, String category) throws IOException {
        Path filePath = getAgentConfigDir(agentId).resolve("memory").resolve(category + ".txt");
        try {
            Files.delete(filePath);
        } catch (java.nio.file.NoSuchFileException e) {
            throw new IllegalArgumentException("Memory file '" + category + "' not found");
        }
    }

    public Map<String, Object> readMcpSettings(String agentId, String mcpName) throws IOException {
        if ("knowledge-service".equals(mcpName)) {
            return readKnowledgeServiceScopeFromConfig(agentId);
        }
        Path settingsPath = getAgentConfigDir(agentId).resolve("mcp").resolve(mcpName).resolve("settings.json");
        if (!Files.exists(settingsPath)) {
            return null;
        }
        try {
            String content = Files.readString(settingsPath);
            if (content == null || content.isBlank()) {
                return null;
            }
            Yaml yaml = new Yaml();
            Object parsed = yaml.load(content);
            if (parsed instanceof Map<?, ?> rawMap) {
                @SuppressWarnings("unchecked")
                Map<String, Object> cast = (Map<String, Object>) rawMap;
                return cast;
            }
            return null;
        } catch (Exception e) {
            log.warn("Failed to parse MCP settings for {}/{}: {}", agentId, mcpName, e.getMessage());
            return null;
        }
    }

    public void writeMcpSettings(String agentId, String mcpName, Map<String, Object> settings) throws IOException {
        if ("knowledge-service".equals(mcpName)) {
            writeKnowledgeServiceScopeToConfig(agentId, settings);
            invalidateCache(agentId);
            return;
        }
        Path mcpDir = getAgentConfigDir(agentId).resolve("mcp").resolve(mcpName);
        if (!Files.isDirectory(mcpDir)) {
            throw new IllegalArgumentException("MCP '" + mcpName + "' not found for agent '" + agentId + "'");
        }
        Path settingsPath = mcpDir.resolve("settings.json");
        Files.createDirectories(mcpDir);
        Yaml yaml = new Yaml();
        Files.writeString(settingsPath, yaml.dump(settings));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readKnowledgeServiceScopeFromConfig(String agentId) {
        Map<String, Object> config = loadAgentConfigYaml(agentId);
        Object extensionsObj = config.get("extensions");
        if (!(extensionsObj instanceof Map<?, ?> extensions)) {
            return null;
        }
        Object extensionObj = extensions.get("knowledge-service");
        if (!(extensionObj instanceof Map<?, ?> extension)) {
            return null;
        }
        Object opsfactoryObj = extension.get("x-opsfactory");
        if (!(opsfactoryObj instanceof Map<?, ?> opsfactory)) {
            return null;
        }
        Object knowledgeScopeObj = opsfactory.get("knowledgeScope");
        if (!(knowledgeScopeObj instanceof Map<?, ?> knowledgeScope)) {
            return null;
        }
        Object sourceId = knowledgeScope.get("sourceId");
        Map<String, Object> result = new HashMap<>();
        result.put("sourceId", sourceId instanceof String source ? source : null);
        return result;
    }

    @SuppressWarnings("unchecked")
    private void writeKnowledgeServiceScopeToConfig(String agentId, Map<String, Object> settings) throws IOException {
        Path configPath = getAgentConfigDir(agentId).resolve("config.yaml");
        Map<String, Object> config = YamlLoader.load(configPath);

        Object extensionsObj = config.get("extensions");
        if (!(extensionsObj instanceof Map<?, ?> rawExtensions)) {
            throw new IllegalArgumentException("Agent config for '" + agentId + "' does not contain extensions");
        }
        Map<String, Object> extensions = (Map<String, Object>) rawExtensions;
        Object extensionObj = extensions.get("knowledge-service");
        if (!(extensionObj instanceof Map<?, ?> rawExtension)) {
            throw new IllegalArgumentException("MCP 'knowledge-service' not found for agent '" + agentId + "'");
        }
        Map<String, Object> extension = (Map<String, Object>) rawExtension;

        Map<String, Object> opsfactory;
        Object opsfactoryObj = extension.get("x-opsfactory");
        if (opsfactoryObj instanceof Map<?, ?> rawOpsfactory) {
            opsfactory = (Map<String, Object>) rawOpsfactory;
        } else {
            opsfactory = new HashMap<>();
            extension.put("x-opsfactory", opsfactory);
        }

        Map<String, Object> knowledgeScope;
        Object knowledgeScopeObj = opsfactory.get("knowledgeScope");
        if (knowledgeScopeObj instanceof Map<?, ?> rawKnowledgeScope) {
            knowledgeScope = (Map<String, Object>) rawKnowledgeScope;
        } else {
            knowledgeScope = new HashMap<>();
            opsfactory.put("knowledgeScope", knowledgeScope);
        }

        Object sourceIdObj = settings != null ? settings.get("sourceId") : null;
        String sourceId = sourceIdObj instanceof String s && !s.isBlank() ? s.trim() : null;
        knowledgeScope.put("sourceId", sourceId);

        Yaml yaml = new Yaml();
        Files.writeString(configPath, yaml.dump(config));
    }

    /**
     * Create a new agent: directory structure, config files, registry update.
     */
    public Map<String, Object> createAgent(String id, String name) throws IOException {
        // Validate ID format
        if (!id.matches("^[a-z0-9]([a-z0-9\\-]*[a-z0-9])?$") || id.length() < 2) {
            throw new IllegalArgumentException(
                    "Agent ID must be at least 2 chars, lowercase letters, numbers, and hyphens only (no leading/trailing hyphens)");
        }

        // Check duplicate ID
        if (findAgent(id) != null) {
            throw new IllegalArgumentException("Agent with ID '" + id + "' already exists");
        }

        // Check duplicate name
        for (AgentRegistryEntry entry : registry) {
            if (entry.name().equals(name)) {
                throw new IllegalArgumentException("Agent with name '" + name + "' already exists");
            }
        }

        // Create directory structure
        Path agentDir = getAgentsDir().resolve(id);
        Path configDir = agentDir.resolve("config");
        Files.createDirectories(configDir.resolve("skills"));

        // Copy config template from universal-agent or use defaults
        Path templateConfig = getAgentsDir().resolve("universal-agent").resolve("config").resolve("config.yaml");
        Path targetConfig = configDir.resolve("config.yaml");
        if (Files.exists(templateConfig)) {
            Files.copy(templateConfig, targetConfig);
        } else {
            Files.writeString(targetConfig, "GOOSE_PROVIDER: openai\nGOOSE_MODEL: gpt-4o\n");
        }

        // Write empty secrets.yaml
        Files.writeString(configDir.resolve("secrets.yaml"), "");

        // Write AGENTS.md
        Files.writeString(agentDir.resolve("AGENTS.md"), "# " + name + "\n");

        // Update config.yaml on disk
        updateAgentsYaml(id, name, false);

        // Update in-memory registry and invalidate cache
        registry.add(new AgentRegistryEntry(id, name));
        invalidateCache(id);

        // Read provider/model from created config
        Map<String, Object> config = YamlLoader.load(targetConfig);
        return Map.of(
                "id", id,
                "name", name,
                "provider", config.getOrDefault("GOOSE_PROVIDER", ""),
                "model", config.getOrDefault("GOOSE_MODEL", ""));
    }

    /**
     * Delete an agent: stop instances, remove files, update registry.
     */
    public void deleteAgent(String id) throws IOException {
        AgentRegistryEntry entry = findAgent(id);
        if (entry == null) {
            throw new IllegalArgumentException("Agent '" + id + "' not found");
        }

        // Remove agent directory
        Path agentDir = getAgentsDir().resolve(id);
        if (Files.exists(agentDir)) {
            FileUtil.deleteRecursively(agentDir);
        }

        // Update config.yaml
        updateAgentsYaml(id, null, true);

        // Remove from in-memory registry and invalidate cache
        registry.removeIf(e -> e.id().equals(id));
        invalidateCache(id);
    }

    private void updateAgentsYaml(String id, String name, boolean remove) throws IOException {
        Path configYaml = getGatewayRoot().resolve("config.yaml");
        Map<String, Object> data = YamlLoader.load(configYaml);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> agents = (List<Map<String, Object>>) data.get("agents");
        if (agents == null) {
            agents = new ArrayList<>();
        }

        if (remove) {
            agents.removeIf(a -> id.equals(a.get("id")));
        } else {
            Map<String, Object> newAgent = new HashMap<>();
            newAgent.put("id", id);
            newAgent.put("name", name);
            agents.add(newAgent);
        }

        data.put("agents", agents);
        org.yaml.snakeyaml.Yaml yaml = new org.yaml.snakeyaml.Yaml();
        Files.writeString(configYaml, yaml.dump(data));
    }


    public Path getAgentsDir() {
        return gatewayRoot.resolve(properties.getPaths().getAgentsDir());
    }

    public Path getUsersDir() {
        return gatewayRoot.resolve(properties.getPaths().getUsersDir());
    }

    @SuppressWarnings("unchecked")
    public Path getKnowledgeCliRootDir(String agentId) {
        Map<String, Object> config = loadAgentConfigYaml(agentId);
        Object extensionsObj = config.get("extensions");
        if (!(extensionsObj instanceof Map<?, ?> extensions)) {
            throw new IllegalArgumentException("Agent config for '" + agentId + "' does not contain extensions");
        }

        Object extensionObj = extensions.get("knowledge-cli");
        if (!(extensionObj instanceof Map<?, ?> extension)) {
            throw new IllegalArgumentException("MCP 'knowledge-cli' not found for agent '" + agentId + "'");
        }

        Object opsfactoryObj = extension.get("x-opsfactory");
        if (!(opsfactoryObj instanceof Map<?, ?> opsfactory)) {
            throw new IllegalArgumentException("MCP 'knowledge-cli' does not contain x-opsfactory scope");
        }

        Object scopeObj = opsfactory.get("scope");
        if (!(scopeObj instanceof Map<?, ?> scope)) {
            throw new IllegalArgumentException("MCP 'knowledge-cli' does not contain scope");
        }

        Object rootDirObj = scope.get("rootDir");
        String configuredRoot = rootDirObj instanceof String s && !s.isBlank() ? s.trim() : "../data";
        Path configDir = getAgentConfigDir(agentId);
        return Path.of(configuredRoot).isAbsolute()
                ? Path.of(configuredRoot).normalize()
                : configDir.resolve(configuredRoot).normalize();
    }

    public Path getUserAgentDir(String userId, String agentId) {
        return getUsersDir().resolve(userId).resolve("agents").resolve(agentId);
    }

    public Path getAgentConfigDir(String agentId) {
        return getAgentsDir().resolve(agentId).resolve("config");
    }

    public Path getGatewayRoot() {
        return gatewayRoot;
    }

    // ── LLM Config for Host Discovery ──────────────────────────────────

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    public record LlmConfig(String baseUrl, String apiKey, String model, String engine) {}

    /**
     * Read LLM connection info from an agent's config.yaml → custom_providers/*.json → secrets.yaml chain.
     */
    @SuppressWarnings("unchecked")
    public LlmConfig getLlmConfig(String agentId) {
        Map<String, Object> config = loadAgentConfigYaml(agentId);
        String providerName = (String) config.get("GOOSE_PROVIDER");
        String model = (String) config.get("GOOSE_MODEL");
        if (providerName == null || providerName.isEmpty()) {
            throw new IllegalArgumentException("Agent '" + agentId + "' has no GOOSE_PROVIDER configured");
        }
        if (model == null || model.isEmpty()) {
            throw new IllegalArgumentException("Agent '" + agentId + "' has no GOOSE_MODEL configured");
        }

        Path providerJson = getAgentConfigDir(agentId)
                .resolve("custom_providers").resolve(providerName + ".json");
        if (!Files.exists(providerJson)) {
            throw new IllegalArgumentException("Custom provider file not found: " + providerJson);
        }

        Map<String, Object> provider;
        try {
            provider = OBJECT_MAPPER.readValue(Files.readString(providerJson), Map.class);
        } catch (IOException e) {
            throw new IllegalArgumentException("Failed to parse provider JSON: " + providerJson, e);
        }

        String baseUrl = (String) provider.get("base_url");
        String apiKeyEnv = (String) provider.get("api_key_env");
        String engine = (String) provider.get("engine");
        if (baseUrl == null || baseUrl.isEmpty()) {
            throw new IllegalArgumentException("Provider '" + providerName + "' has no base_url");
        }

        String apiKey = "";
        if (apiKeyEnv != null && !apiKeyEnv.isEmpty()) {
            Map<String, Object> secrets = loadAgentSecretsYaml(agentId);
            Object keyObj = secrets.get(apiKeyEnv);
            if (keyObj instanceof String s && !s.isEmpty()) {
                apiKey = s;
            }
        }

        return new LlmConfig(baseUrl, apiKey, model, engine);
    }
}
