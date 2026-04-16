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
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class CommandWhitelistService {

    private static final Logger log = LoggerFactory.getLogger(CommandWhitelistService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private static final List<String> DEFAULT_COMMANDS = List.of(
            "ps", "tail", "grep", "cat", "ls", "df", "free", "netstat",
            "top", "cd", "find", "wc", "head", "date", "uptime",
            "iostat", "ping"
    );

    private static final Map<String, String> DEFAULT_RISK_LEVELS = Map.ofEntries(
            Map.entry("ps", "low"), Map.entry("tail", "low"), Map.entry("grep", "low"),
            Map.entry("cat", "low"), Map.entry("ls", "low"), Map.entry("df", "low"),
            Map.entry("free", "low"), Map.entry("head", "low"), Map.entry("date", "low"),
            Map.entry("uptime", "low"), Map.entry("cd", "low"), Map.entry("find", "low"),
            Map.entry("wc", "low"),
            Map.entry("netstat", "medium"), Map.entry("top", "medium"),
            Map.entry("iostat", "medium"), Map.entry("ping", "medium")
    );

    private final GatewayProperties properties;
    private Path gatewayRoot;
    private Path whitelistFile;

    public CommandWhitelistService(GatewayProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    public void init() {
        this.gatewayRoot = properties.getGatewayRootPath();
        this.whitelistFile = gatewayRoot.resolve("data").resolve("command-whitelist.json");

        initializeDefaultIfNeeded();
        log.info("CommandWhitelistService initialized, whitelistFile={}", whitelistFile);
    }

    // ── Whitelist Operations ─────────────────────────────────────────

    public Map<String, Object> getWhitelist() {
        return readWhitelistFile();
    }

    public void addCommand(Map<String, Object> command) {
        Map<String, Object> whitelist = readWhitelistFile();
        Object commandsObj = whitelist.get("commands");
        List<Map<String, Object>> commands = ensureCommandsList(commandsObj);

        // Dedup: reject duplicate patterns
        Object patternObj = command.get("pattern");
        if (patternObj != null) {
            String newPattern = patternObj.toString();
            for (Map<String, Object> existing : commands) {
                if (newPattern.equals(existing.get("pattern"))) {
                    throw new IllegalArgumentException("Command pattern already exists: " + newPattern);
                }
            }
        }

        commands.add(command);
        whitelist.put("commands", commands);
        writeWhitelistFile(whitelist);
        log.info("Added command to whitelist: {}", command.get("pattern"));
    }

    public void updateCommand(String pattern, Map<String, Object> updates) {
        Map<String, Object> whitelist = readWhitelistFile();
        Object commandsObj = whitelist.get("commands");
        List<Map<String, Object>> commands = ensureCommandsList(commandsObj);

        boolean found = false;
        for (Map<String, Object> cmd : commands) {
            if (pattern.equals(cmd.get("pattern"))) {
                cmd.putAll(updates);
                // Preserve the original pattern unless explicitly changed
                if (!updates.containsKey("pattern")) {
                    cmd.put("pattern", pattern);
                }
                found = true;
                break;
            }
        }

        if (!found) {
            throw new IllegalArgumentException("Command pattern not found: " + pattern);
        }

        whitelist.put("commands", commands);
        writeWhitelistFile(whitelist);
        log.info("Updated command in whitelist: {}", pattern);
    }

    public void deleteCommand(String pattern) {
        Map<String, Object> whitelist = readWhitelistFile();
        Object commandsObj = whitelist.get("commands");
        List<Map<String, Object>> commands = ensureCommandsList(commandsObj);

        boolean removed = commands.removeIf(cmd -> pattern.equals(cmd.get("pattern")));
        if (!removed) {
            throw new IllegalArgumentException("Command pattern not found: " + pattern);
        }

        whitelist.put("commands", commands);
        writeWhitelistFile(whitelist);
        log.info("Deleted command from whitelist: {}", pattern);
    }

    /**
     * Validate a command string by splitting on pipe and semicolon delimiters,
     * extracting the first word of each subcommand, and checking if all are
     * in the whitelist and enabled.
     *
     * @return a list of rejected command names (empty if all pass)
     */
    public List<String> validateCommand(String command) {
        List<String> rejected = new ArrayList<>();

        // Build set of enabled patterns
        Map<String, Object> whitelist = readWhitelistFile();
        Object commandsObj = whitelist.get("commands");
        List<Map<String, Object>> commands = ensureCommandsList(commandsObj);

        Map<String, Boolean> enabledPatterns = new LinkedHashMap<>();
        for (Map<String, Object> cmd : commands) {
            Object patternObj = cmd.get("pattern");
            Object enabledObj = cmd.get("enabled");
            if (patternObj != null) {
                boolean enabled = !(enabledObj instanceof Boolean b) || b;
                enabledPatterns.put(patternObj.toString(), enabled);
            }
        }

        // Split command by | and ; (shell-aware: respects quoting)
        List<String> subcommands = splitShellPipe(command);
        for (String sub : subcommands) {
            String trimmed = sub.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            // Extract first word (the command name)
            String[] parts = trimmed.split("\\s+", 2);
            String cmdName = parts[0].trim();
            if (cmdName.isEmpty()) {
                continue;
            }

            Boolean enabled = enabledPatterns.get(cmdName);
            if (enabled == null || !enabled) {
                rejected.add(cmdName);
            }
        }

        return rejected;
    }

    /**
     * Determine the risk level of a command string.
     * Returns "high" if any sub-command is not in the whitelist,
     * "medium" if any sub-command is medium, otherwise "low".
     */
    public String getRiskLevel(String command) {
        String highestRisk = "low";
        Map<String, Object> whitelist = readWhitelistFile();
        List<Map<String, Object>> commands = ensureCommandsList(whitelist.get("commands"));
        Map<String, String> riskMap = new LinkedHashMap<>();
        for (Map<String, Object> cmd : commands) {
            Object p = cmd.get("pattern");
            Object r = cmd.get("riskLevel");
            if (p != null) riskMap.put(p.toString(), r != null ? r.toString() : "high");
        }
        for (String sub : splitShellPipe(command)) {
            String trimmed = sub.trim();
            if (trimmed.isEmpty()) continue;
            String[] parts = trimmed.split("\\s+", 2);
            String name = parts[0].trim();
            if (name.isEmpty()) continue;
            String risk = riskMap.getOrDefault(name, "high");
            if ("high".equals(risk)) return "high";
            if ("medium".equals(risk) && "low".equals(highestRisk)) highestRisk = "medium";
        }
        return highestRisk;
    }

    // ── Shell-Aware Pipe/Semicolon Splitter ─────────────────────────

    /**
     * Split a command string on unquoted {@code |} and {@code;} delimiters,
     * respecting single quotes, double quotes, and backslash escaping.
     */
    private List<String> splitShellPipe(String command) {
        List<String> parts = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inSingle = false, inDouble = false;
        for (int i = 0; i < command.length(); i++) {
            char c = command.charAt(i);
            if (c == '\\' && !inSingle && i + 1 < command.length()) {
                current.append(c).append(command.charAt(++i));
                continue;
            }
            if (c == '\'' && !inDouble) { inSingle = !inSingle; current.append(c); continue; }
            if (c == '"'  && !inSingle) { inDouble = !inDouble; current.append(c); continue; }
            if ((c == '|' || c == ';') && !inSingle && !inDouble) {
                parts.add(current.toString());
                current.setLength(0);
                continue;
            }
            current.append(c);
        }
        if (current.length() > 0) parts.add(current.toString());
        return parts;
    }

    // ── Default Initialization ───────────────────────────────────────

    private void initializeDefaultIfNeeded() {
        if (Files.exists(whitelistFile)) {
            return;
        }

        try {
            Files.createDirectories(whitelistFile.getParent());

            List<Map<String, Object>> commands = new ArrayList<>();
            for (String cmd : DEFAULT_COMMANDS) {
                Map<String, Object> entry = new LinkedHashMap<>();
                entry.put("pattern", cmd);
                entry.put("description", "");
                entry.put("enabled", true);
                entry.put("riskLevel", DEFAULT_RISK_LEVELS.getOrDefault(cmd, "high"));
                commands.add(entry);
            }

            Map<String, Object> whitelist = new LinkedHashMap<>();
            whitelist.put("commands", commands);

            writeWhitelistFile(whitelist);
            log.info("Initialized default command whitelist with {} commands", commands.size());
        } catch (Exception e) {
            log.error("Failed to initialize default command whitelist", e);
        }
    }

    // ── File I/O Helpers ─────────────────────────────────────────────

    private Map<String, Object> readWhitelistFile() {
        if (!Files.exists(whitelistFile)) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("commands", new ArrayList<>());
            return empty;
        }
        try {
            String json = Files.readString(whitelistFile, StandardCharsets.UTF_8);
            return MAPPER.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (IOException e) {
            log.error("Failed to read command whitelist file: {}", whitelistFile, e);
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("commands", new ArrayList<>());
            return empty;
        }
    }

    private void writeWhitelistFile(Map<String, Object> whitelist) {
        try {
            Files.createDirectories(whitelistFile.getParent());
            String json = MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(whitelist);
            Files.writeString(whitelistFile, json, StandardCharsets.UTF_8);
        } catch (IOException e) {
            log.error("Failed to write command whitelist file: {}", whitelistFile, e);
            throw new RuntimeException("Failed to save command whitelist", e);
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> ensureCommandsList(Object commandsObj) {
        if (commandsObj instanceof List<?> list) {
            List<Map<String, Object>> result = new ArrayList<>();
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    result.add((Map<String, Object>) map);
                }
            }
            return result;
        }
        return new ArrayList<>();
    }
}
