package com.huawei.opsfactory.gateway.service.channel;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huawei.opsfactory.gateway.common.model.AgentRegistryEntry;
import com.huawei.opsfactory.gateway.config.GatewayProperties;
import com.huawei.opsfactory.gateway.service.AgentConfigService;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelBinding;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelDetail;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelEvent;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelInstance;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelSummary;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelUpsertRequest;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelVerificationResult;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelConnectionConfig;
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
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.UnaryOperator;
import java.util.regex.Pattern;

@Service
public class ChannelConfigService {

    private static final Logger log = LoggerFactory.getLogger(ChannelConfigService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final Pattern CHANNEL_ID_PATTERN = Pattern.compile("^[a-z0-9-]+$");
    private static final int MAX_EVENTS = 200;
    private static final List<String> SUPPORTED_TYPES = List.of("whatsapp", "wechat");

    private final GatewayProperties properties;
    private final AgentConfigService agentConfigService;

    private Path channelsDir;
    private Path legacyChannelsDir;

    public ChannelConfigService(GatewayProperties properties, AgentConfigService agentConfigService) {
        this.properties = properties;
        this.agentConfigService = agentConfigService;
    }

    @PostConstruct
    public void init() {
        Path gatewayRoot = properties.getGatewayRootPath();
        this.channelsDir = gatewayRoot.resolve("channels");
        this.legacyChannelsDir = gatewayRoot.resolve("data").resolve("channels");

        try {
            Files.createDirectories(channelsDir);
            migrateLegacyLayoutIfNeeded();
        } catch (IOException e) {
            throw new IllegalStateException("Failed to initialize channels storage", e);
        }
    }

    public List<ChannelSummary> listChannels() {
        List<ChannelInstance> channels = readInstances();
        List<ChannelBinding> bindings = readBindings();

        return channels.stream()
                .map(channel -> toSummary(applyRuntimeState(channel), bindings))
                .sorted(Comparator.comparing(ChannelSummary::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    public ChannelDetail getChannel(String channelId) {
        ChannelInstance channel = findChannel(channelId);
        if (channel == null) {
            return null;
        }
        ChannelInstance effectiveChannel = applyRuntimeState(channel);

        List<ChannelBinding> bindings = readBindings().stream()
                .filter(binding -> channelId.equals(binding.channelId()))
                .sorted(Comparator.comparing(ChannelBinding::lastInboundAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();

        List<ChannelEvent> events = readEvents().stream()
                .filter(event -> channelId.equals(event.channelId()))
                .sorted(Comparator.comparing(ChannelEvent::createdAt, Comparator.reverseOrder()))
                .limit(20)
                .toList();

        return new ChannelDetail(
                effectiveChannel.id(),
                effectiveChannel.name(),
                effectiveChannel.type(),
                effectiveChannel.enabled(),
                effectiveChannel.defaultAgentId(),
                effectiveChannel.ownerUserId(),
                effectiveChannel.createdAt(),
                effectiveChannel.updatedAt(),
                usesWebhook(effectiveChannel.type()) ? webhookPath(effectiveChannel) : "",
                effectiveChannel.config(),
                verifyChannel(effectiveChannel),
                bindings,
                events
        );
    }

    public ChannelDetail createChannel(ChannelUpsertRequest request, String ownerUserId) {
        validateCreateRequest(request);

        List<ChannelInstance> channels = new ArrayList<>(readInstances());
        if (channels.stream().anyMatch(channel -> channel.id().equals(request.id()))) {
            throw new IllegalArgumentException("Channel '" + request.id() + "' already exists");
        }

        String now = Instant.now().toString();
        ChannelInstance created = new ChannelInstance(
                request.id().trim(),
                request.name().trim(),
                normalizeType(request.type()),
                request.enabled() == null || request.enabled(),
                request.defaultAgentId().trim(),
                normalizeOwnerUserId(ownerUserId),
                now,
                now,
                    normalizeConfig(request.type(), request.config())
        );
        channels.add(created);
        writeChannelConfig(created);
        initializeChannelRuntimeFiles(created.id(), created.type());
        appendEvent(created.id(), "info", "channel.created", "Channel created");
        return getChannel(created.id());
    }

    public ChannelDetail updateChannel(String channelId, ChannelUpsertRequest request) {
        ChannelInstance existing = findChannel(channelId);
        if (existing == null) {
            throw new IllegalArgumentException("Channel '" + channelId + "' not found");
        }

        validateUpdateRequest(request);

        ChannelInstance updated = new ChannelInstance(
                existing.id(),
                normalizeName(request.name(), existing.name()),
                normalizeType(request.type() != null ? request.type() : existing.type()),
                request.enabled() != null ? request.enabled() : existing.enabled(),
                normalizeAgentId(request.defaultAgentId(), existing.defaultAgentId()),
                normalizeOwnerUserId(existing.ownerUserId()),
                existing.createdAt(),
                Instant.now().toString(),
                mergeConfig(existing.type(), existing.config(), request.config())
        );

        writeChannelConfig(updated);
        appendEvent(channelId, "info", "channel.updated", "Channel updated");
        return getChannel(channelId);
    }

    public ChannelDetail setEnabled(String channelId, boolean enabled) {
        ChannelInstance existing = findChannel(channelId);
        if (existing == null) {
            throw new IllegalArgumentException("Channel '" + channelId + "' not found");
        }

        ChannelInstance updated = new ChannelInstance(
                existing.id(),
                existing.name(),
                existing.type(),
                enabled,
                existing.defaultAgentId(),
                normalizeOwnerUserId(existing.ownerUserId()),
                existing.createdAt(),
                Instant.now().toString(),
                existing.config()
        );

        writeChannelConfig(updated);
        appendEvent(channelId, "info", enabled ? "channel.enabled" : "channel.disabled",
                enabled ? "Channel enabled" : "Channel disabled");
        return getChannel(channelId);
    }

    public void deleteChannel(String channelId) {
        ChannelInstance existing = findChannel(channelId);
        if (existing == null) {
            throw new IllegalArgumentException("Channel '" + channelId + "' not found");
        }

        deleteDirectory(channelDir(existing.type(), channelId));
    }

    public List<ChannelBinding> listBindings(String channelId) {
        if (findChannel(channelId) == null) {
            throw new IllegalArgumentException("Channel '" + channelId + "' not found");
        }
        return readBindings().stream()
                .filter(binding -> channelId.equals(binding.channelId()))
                .sorted(Comparator.comparing(ChannelBinding::lastInboundAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
    }

    public List<ChannelEvent> listEvents(String channelId) {
        if (findChannel(channelId) == null) {
            throw new IllegalArgumentException("Channel '" + channelId + "' not found");
        }
        return readEvents().stream()
                .filter(event -> channelId.equals(event.channelId()))
                .sorted(Comparator.comparing(ChannelEvent::createdAt, Comparator.reverseOrder()))
                .limit(50)
                .toList();
    }

    public ChannelVerificationResult verifyChannel(String channelId) {
        ChannelInstance existing = findChannel(channelId);
        if (existing == null) {
            throw new IllegalArgumentException("Channel '" + channelId + "' not found");
        }
        ChannelVerificationResult result = verifyChannel(applyRuntimeState(existing));
        appendEvent(channelId,
                result.ok() ? "info" : "warning",
                "channel.verified",
                result.ok() ? "Channel configuration verified" : String.join("; ", result.issues()));
        return result;
    }

    public void recordEvent(String channelId, String level, String type, String summary) {
        appendEvent(channelId, level, type, summary);
    }

    public ChannelDetail updateChannelConfig(String channelId, UnaryOperator<ChannelConnectionConfig> updater) {
        ChannelInstance existing = findChannel(channelId);
        if (existing == null) {
            throw new IllegalArgumentException("Channel '" + channelId + "' not found");
        }

        ChannelInstance updated = new ChannelInstance(
                existing.id(),
                existing.name(),
                existing.type(),
                existing.enabled(),
                existing.defaultAgentId(),
                normalizeOwnerUserId(existing.ownerUserId()),
                existing.createdAt(),
                Instant.now().toString(),
                updater.apply(normalizeConfig(existing.type(), existing.config()))
        );
        writeChannelConfig(updated);
        return getChannel(channelId);
    }

    public ChannelDetail resetChannelRuntimeState(String channelId) {
        ChannelInstance existing = findChannel(channelId);
        if (existing == null) {
            throw new IllegalArgumentException("Channel '" + channelId + "' not found");
        }

        ChannelInstance updated = new ChannelInstance(
                existing.id(),
                existing.name(),
                existing.type(),
                existing.enabled(),
                existing.defaultAgentId(),
                existing.ownerUserId(),
                existing.createdAt(),
                Instant.now().toString(),
                new ChannelConnectionConfig(
                        "disconnected",
                        existing.config().authStateDir(),
                        "",
                        "",
                        "",
                        "",
                        existing.type().equals("wechat") ? existing.config().wechatId() : "",
                        existing.type().equals("wechat") ? existing.config().displayName() : ""
                )
        );
        writeChannelConfig(updated);
        return getChannel(channelId);
    }

    private ChannelSummary toSummary(ChannelInstance channel, List<ChannelBinding> allBindings) {
        List<ChannelBinding> bindings = allBindings.stream()
                .filter(binding -> channel.id().equals(binding.channelId()))
                .toList();
        ChannelVerificationResult verification = verifyChannel(channel);
        String status;
        if (!channel.enabled()) {
            status = "DISABLED";
        } else if ("connected".equals(channel.config().loginStatus())) {
            status = "ACTIVE";
        } else if ("pending".equals(channel.config().loginStatus())) {
            status = "PENDING_LOGIN";
        } else if ("error".equals(channel.config().loginStatus())) {
            status = "ERROR";
        } else if (verification.ok()) {
            status = "ACTIVE";
        } else {
            status = "LOGIN_REQUIRED";
        }

        String lastInboundAt = bindings.stream()
                .map(ChannelBinding::lastInboundAt)
                .filter(value -> value != null && !value.isBlank())
                .max(String::compareTo)
                .orElse(null);
        String lastOutboundAt = bindings.stream()
                .map(ChannelBinding::lastOutboundAt)
                .filter(value -> value != null && !value.isBlank())
                .max(String::compareTo)
                .orElse(null);

        return new ChannelSummary(
                channel.id(),
                channel.name(),
                channel.type(),
                channel.enabled(),
                channel.defaultAgentId(),
                channel.ownerUserId(),
                status,
                lastInboundAt,
                lastOutboundAt,
                bindings.size()
        );
    }

    private ChannelVerificationResult verifyChannel(ChannelInstance channel) {
        List<String> issues = new ArrayList<>();
        if (isBlank(channel.name())) {
            issues.add("Channel name is required");
        }
        AgentRegistryEntry agent = agentConfigService.findAgent(channel.defaultAgentId());
        if (agent == null) {
            issues.add("Default agent '" + channel.defaultAgentId() + "' not found");
        }

        ChannelConnectionConfig config = channel.config();
        if (config == null) {
            issues.add("Channel config is required");
        } else {
            if (!isConfiguredValue(config.authStateDir())) issues.add("authStateDir is required");
            if ("error".equals(config.loginStatus()) && isConfiguredValue(config.lastError())) {
                issues.add(config.lastError());
            } else if (channel.enabled() && !"connected".equals(config.loginStatus())) {
                issues.add("wechat".equals(channel.type()) ? "WeChat login required" : "WhatsApp Web login required");
            }
        }

        return new ChannelVerificationResult(issues.isEmpty(), issues);
    }

    private ChannelInstance findChannel(String channelId) {
        return readInstances().stream()
                .filter(channel -> channel.id().equals(channelId))
                .findFirst()
                .orElse(null);
    }

    private void validateCreateRequest(ChannelUpsertRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Request body is required");
        }
        if (isBlank(request.id())) {
            throw new IllegalArgumentException("Channel ID is required");
        }
        String trimmedId = request.id().trim();
        if (!CHANNEL_ID_PATTERN.matcher(trimmedId).matches()) {
            throw new IllegalArgumentException("Channel ID must contain only lowercase letters, numbers, and hyphens");
        }
        validateUpdateRequest(request);
    }

    private void validateUpdateRequest(ChannelUpsertRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Request body is required");
        }
        if (isBlank(request.name())) {
            throw new IllegalArgumentException("Channel name is required");
        }
        if (isBlank(request.defaultAgentId())) {
            throw new IllegalArgumentException("Default agent is required");
        }
        if (agentConfigService.findAgent(request.defaultAgentId().trim()) == null) {
            throw new IllegalArgumentException("Default agent '" + request.defaultAgentId().trim() + "' not found");
        }
        String type = normalizeType(request.type());
        if (!SUPPORTED_TYPES.contains(type)) {
            throw new IllegalArgumentException("Unsupported channel type '" + type + "'");
        }
    }

    private String normalizeType(String type) {
        return isBlank(type) ? "whatsapp" : type.trim().toLowerCase();
    }

    private String normalizeName(String maybeName, String fallback) {
        return isBlank(maybeName) ? fallback : maybeName.trim();
    }

    private String normalizeAgentId(String maybeAgentId, String fallback) {
        return isBlank(maybeAgentId) ? fallback : maybeAgentId.trim();
    }

    private String normalizeOwnerUserId(String ownerUserId) {
        return isBlank(ownerUserId) ? "admin" : ownerUserId.trim();
    }

    private ChannelConnectionConfig normalizeConfig(String type, ChannelConnectionConfig config) {
        if (config == null) {
            return defaultConfig(type);
        }
        return new ChannelConnectionConfig(
                normalizeLoginStatus(config.loginStatus()),
                emptyIfNull(config.authStateDir()).isBlank() ? "auth" : config.authStateDir().trim(),
                emptyIfNull(config.lastConnectedAt()),
                emptyIfNull(config.lastDisconnectedAt()),
                emptyIfNull(config.lastError()),
                "whatsapp".equals(type) ? emptyIfNull(config.selfPhone()) : "",
                "wechat".equals(type) ? emptyIfNull(config.wechatId()) : "",
                "wechat".equals(type) ? emptyIfNull(config.displayName()) : ""
        );
    }

    private ChannelConnectionConfig mergeConfig(String type, ChannelConnectionConfig existing, ChannelConnectionConfig updates) {
        ChannelConnectionConfig current = normalizeConfig(type, existing);
        if (updates == null) {
            return current;
        }
        return new ChannelConnectionConfig(
                normalizeLoginStatus(choose(updates.loginStatus(), current.loginStatus())),
                choose(updates.authStateDir(), current.authStateDir()),
                choose(updates.lastConnectedAt(), current.lastConnectedAt()),
                choose(updates.lastDisconnectedAt(), current.lastDisconnectedAt()),
                choose(updates.lastError(), current.lastError()),
                "whatsapp".equals(type) ? choose(updates.selfPhone(), current.selfPhone()) : "",
                "wechat".equals(type) ? choose(updates.wechatId(), current.wechatId()) : "",
                "wechat".equals(type) ? choose(updates.displayName(), current.displayName()) : ""
        );
    }

    private String choose(String candidate, String fallback) {
        return candidate == null ? fallback : candidate;
    }

    private ChannelConnectionConfig defaultConfig(String type) {
        return new ChannelConnectionConfig(
                "disconnected",
                "auth",
                "",
                "",
                "",
                "",
                "",
                ""
        );
    }

    private String emptyIfNull(String value) {
        return value == null ? "" : value;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private boolean isConfiguredValue(String value) {
        if (isBlank(value)) {
            return false;
        }
        return !value.trim().startsWith("TODO_");
    }

    private String normalizeLoginStatus(String loginStatus) {
        if (isBlank(loginStatus)) {
            return "disconnected";
        }
        return loginStatus.trim().toLowerCase();
    }

    private void appendEvent(String channelId, String level, String type, String summary) {
        ChannelInstance channel = findChannel(channelId);
        if (channel == null) {
            return;
        }

        List<ChannelEvent> events = new ArrayList<>(readEvents(channelId, channel.type()));
        events.add(new ChannelEvent(
                UUID.randomUUID().toString(),
                channelId,
                level,
                type,
                summary,
                Instant.now().toString()
        ));
        if (events.size() > MAX_EVENTS) {
            events = events.subList(events.size() - MAX_EVENTS, events.size());
        }
        writeEvents(channelId, channel.type(), events);
    }

    private List<ChannelInstance> readInstances() {
        if (!Files.isDirectory(channelsDir)) {
            return List.of();
        }

        List<ChannelInstance> channels = new ArrayList<>();
        try (DirectoryStream<Path> typeDirs = Files.newDirectoryStream(channelsDir)) {
            for (Path typeDir : typeDirs) {
                if (!Files.isDirectory(typeDir)) {
                    continue;
                }
                try (DirectoryStream<Path> instanceDirs = Files.newDirectoryStream(typeDir)) {
                    for (Path instanceDir : instanceDirs) {
                        if (!Files.isDirectory(instanceDir)) {
                            continue;
                        }
                        ChannelInstance channel = readChannelConfig(instanceDir);
                        if (channel != null) {
                            channels.add(channel);
                        }
                    }
                }
            }
        } catch (IOException e) {
            log.warn("Failed to read channel directories {}: {}", channelsDir, e.getMessage());
        }
        return channels;
    }

    private List<ChannelBinding> readBindings() {
        return readInstances().stream()
                .flatMap(channel -> readBindings(channel.id(), channel.type()).stream())
                .toList();
    }

    private List<ChannelBinding> readBindings(String channelId, String type) {
        Map<String, Object> wrapper = readJson(bindingsFile(channelId, type));
        return MAPPER.convertValue(wrapper.getOrDefault("bindings", List.of()),
                new TypeReference<List<ChannelBinding>>() {});
    }

    private void writeBindings(String channelId, String type, List<ChannelBinding> bindings) {
        writeJson(bindingsFile(channelId, type), Map.of("bindings", bindings));
    }

    private List<ChannelEvent> readEvents() {
        return readInstances().stream()
                .flatMap(channel -> readEvents(channel.id(), channel.type()).stream())
                .toList();
    }

    private List<ChannelEvent> readEvents(String channelId, String type) {
        Map<String, Object> wrapper = readJson(eventsFile(channelId, type));
        return MAPPER.convertValue(wrapper.getOrDefault("events", List.of()),
                new TypeReference<List<ChannelEvent>>() {});
    }

    private void writeEvents(String channelId, String type, List<ChannelEvent> events) {
        writeJson(eventsFile(channelId, type), Map.of("events", events));
    }

    private ChannelInstance readChannelConfig(Path instanceDir) {
        try {
            String content = Files.readString(configFile(instanceDir), StandardCharsets.UTF_8);
            @SuppressWarnings("unchecked")
            Map<String, Object> raw = MAPPER.readValue(content, Map.class);
            return deserializeChannelInstance(raw);
        } catch (IOException e) {
            log.warn("Failed to read channel config {}: {}", instanceDir, e.getMessage());
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private ChannelInstance deserializeChannelInstance(Map<String, Object> raw) {
        Map<String, Object> rawConfig = raw.get("config") instanceof Map<?, ?> map
                ? (Map<String, Object>) map
                : Map.of();

        return new ChannelInstance(
                emptyIfNull((String) raw.get("id")),
                emptyIfNull((String) raw.get("name")),
                normalizeType((String) raw.get("type")),
                raw.get("enabled") instanceof Boolean enabled && enabled,
                emptyIfNull((String) raw.get("defaultAgentId")),
                normalizeOwnerUserId((String) raw.get("ownerUserId")),
                emptyIfNull((String) raw.get("createdAt")),
                emptyIfNull((String) raw.get("updatedAt")),
                deserializeChannelConfig((String) raw.get("type"), rawConfig)
        );
    }

    private ChannelConnectionConfig deserializeChannelConfig(String type, Map<String, Object> rawConfig) {
        String normalizedType = normalizeType(type);
        if (rawConfig.containsKey("loginStatus")
                || rawConfig.containsKey("authStateDir")
                || rawConfig.containsKey("selfPhone")
                || rawConfig.containsKey("wechatId")
                || rawConfig.containsKey("displayName")) {
            return normalizeConfig(normalizedType, MAPPER.convertValue(rawConfig, ChannelConnectionConfig.class));
        }

        if ("whatsapp".equals(normalizedType) && !rawConfig.isEmpty()) {
            return new ChannelConnectionConfig(
                    "disconnected",
                    "auth",
                    "",
                    "",
                    "Legacy WhatsApp Cloud API config detected. Switch this channel to WhatsApp Web login.",
                    "",
                    "",
                    ""
            );
        }
        return defaultConfig(normalizedType);
    }

    private void writeChannelConfig(ChannelInstance channel) {
        writeJson(configFile(channel.id(), channel.type()), channel);
    }

    private void initializeChannelRuntimeFiles(String channelId, String type) {
        try {
            initializeIfMissing(bindingsFile(channelId, type), Map.of("bindings", List.of()));
            initializeIfMissing(dedupFile(channelId, type), Map.of("messages", List.of()));
            initializeIfMissing(eventsFile(channelId, type), Map.of("events", List.of()));
        } catch (IOException e) {
            throw new IllegalStateException("Failed to initialize channel runtime files for " + channelId, e);
        }
    }

    private void initializeIfMissing(Path file, Object payload) throws IOException {
        if (Files.exists(file)) {
            return;
        }
        Files.createDirectories(file.getParent());
        Files.writeString(file,
                MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(payload),
                StandardCharsets.UTF_8);
    }

    private void migrateLegacyLayoutIfNeeded() throws IOException {
        Path legacyInstancesFile = legacyChannelsDir.resolve("instances.json");
        if (!Files.exists(legacyInstancesFile) || hasAnyChannelInstance()) {
            return;
        }

        List<ChannelInstance> legacyChannels = MAPPER.convertValue(
                readJson(legacyInstancesFile).getOrDefault("channels", List.of()),
                new TypeReference<List<ChannelInstance>>() {});
        List<ChannelBinding> legacyBindings = MAPPER.convertValue(
                readJson(legacyChannelsDir.resolve("bindings.json")).getOrDefault("bindings", List.of()),
                new TypeReference<List<ChannelBinding>>() {});
        List<ChannelEvent> legacyEvents = MAPPER.convertValue(
                readJson(legacyChannelsDir.resolve("events.json")).getOrDefault("events", List.of()),
                new TypeReference<List<ChannelEvent>>() {});
        Map<String, List<Map<String, Object>>> dedupByChannel = splitByChannel(
                readJson(legacyChannelsDir.resolve("inbound-dedup.json")).getOrDefault("messages", List.of()));

        for (ChannelInstance channel : legacyChannels) {
            writeChannelConfig(channel);
            writeBindings(channel.id(), channel.type(), legacyBindings.stream()
                    .filter(binding -> channel.id().equals(binding.channelId()))
                    .toList());
            writeEvents(channel.id(), channel.type(), legacyEvents.stream()
                    .filter(event -> channel.id().equals(event.channelId()))
                    .toList());
            writeJson(dedupFile(channel.id(), channel.type()),
                    Map.of("messages", dedupByChannel.getOrDefault(channel.id(), List.of())));
        }

        log.info("Migrated {} legacy channel instance(s) into gateway/channels", legacyChannels.size());
    }

    private boolean hasAnyChannelInstance() throws IOException {
        if (!Files.isDirectory(channelsDir)) {
            return false;
        }
        try (DirectoryStream<Path> typeDirs = Files.newDirectoryStream(channelsDir)) {
            for (Path typeDir : typeDirs) {
                if (!Files.isDirectory(typeDir)) {
                    continue;
                }
                try (DirectoryStream<Path> instanceDirs = Files.newDirectoryStream(typeDir)) {
                    if (instanceDirs.iterator().hasNext()) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    @SuppressWarnings("unchecked")
    private Map<String, List<Map<String, Object>>> splitByChannel(Object rawItems) {
        Map<String, List<Map<String, Object>>> byChannel = new LinkedHashMap<>();
        if (!(rawItems instanceof List<?> items)) {
            return byChannel;
        }
        for (Object item : items) {
            if (!(item instanceof Map<?, ?> rawMap)) {
                continue;
            }
            Map<String, Object> normalized = new LinkedHashMap<>();
            rawMap.forEach((key, value) -> normalized.put(String.valueOf(key), value));
            String channelId = String.valueOf(normalized.getOrDefault("channelId", ""));
            if (channelId.isBlank()) {
                continue;
            }
            byChannel.computeIfAbsent(channelId, ignored -> new ArrayList<>()).add(normalized);
        }
        return byChannel;
    }

    private Path typeDir(String type) {
        return channelsDir.resolve(normalizeType(type));
    }

    private Path channelDir(String type, String channelId) {
        return typeDir(type).resolve(channelId);
    }

    public Path channelDirectory(String type, String channelId) {
        return channelDir(type, channelId);
    }

    public Path getGatewayRoot() {
        return properties.getGatewayRootPath();
    }

    private Path configFile(String channelId, String type) {
        return channelDir(type, channelId).resolve("config.json");
    }

    private Path configFile(Path instanceDir) {
        return instanceDir.resolve("config.json");
    }

    private Path bindingsFile(String channelId, String type) {
        return channelDir(type, channelId).resolve("bindings.json");
    }

    private Path dedupFile(String channelId, String type) {
        return channelDir(type, channelId).resolve("inbound-dedup.json");
    }

    private Path eventsFile(String channelId, String type) {
        return channelDir(type, channelId).resolve("events.json");
    }

    private String webhookPath(ChannelInstance channel) {
        return "/gateway/channels/webhooks/" + normalizeType(channel.type()) + "/" + channel.id();
    }

    private boolean usesWebhook(String type) {
        return !List.of("whatsapp", "wechat").contains(normalizeType(type));
    }

    @SuppressWarnings("unchecked")
    private ChannelInstance applyRuntimeState(ChannelInstance channel) {
        if (!List.of("whatsapp", "wechat").contains(channel.type())) {
            return channel;
        }

        Path runtimeFile = channelDir(channel.type(), channel.id()).resolve("login-state.json");
        if (!Files.exists(runtimeFile)) {
            return channel;
        }

        try {
            Map<String, Object> raw = MAPPER.readValue(Files.readString(runtimeFile, StandardCharsets.UTF_8), Map.class);
            ChannelConnectionConfig current = channel.config();
            String runtimeStatus = asString(raw.get("status"));
            String runtimeSelfPhone = asString(raw.get("selfPhone"));
            String runtimeConnectedAt = asString(raw.get("lastConnectedAt"));
            String runtimeDisconnectedAt = asString(raw.get("lastDisconnectedAt"));
            String runtimeError = asString(raw.get("lastError"));
            String runtimeWechatId = asString(raw.get("wechatId"));
            String runtimeDisplayName = asString(raw.get("displayName"));

            ChannelConnectionConfig merged = new ChannelConnectionConfig(
                    runtimeStatus != null ? normalizeLoginStatus(runtimeStatus) : current.loginStatus(),
                    current.authStateDir(),
                    runtimeConnectedAt != null ? runtimeConnectedAt : current.lastConnectedAt(),
                    runtimeDisconnectedAt != null ? runtimeDisconnectedAt : current.lastDisconnectedAt(),
                    runtimeError != null ? runtimeError : current.lastError(),
                    "whatsapp".equals(channel.type())
                            ? (runtimeSelfPhone != null ? runtimeSelfPhone : current.selfPhone())
                            : current.selfPhone(),
                    "wechat".equals(channel.type())
                            ? (runtimeWechatId != null ? runtimeWechatId : current.wechatId())
                            : current.wechatId(),
                    "wechat".equals(channel.type())
                            ? (runtimeDisplayName != null ? runtimeDisplayName : current.displayName())
                            : current.displayName()
            );

            return new ChannelInstance(
                    channel.id(),
                    channel.name(),
                    channel.type(),
                    channel.enabled(),
                    channel.defaultAgentId(),
                    channel.ownerUserId(),
                    channel.createdAt(),
                    channel.updatedAt(),
                    merged
            );
        } catch (IOException e) {
            log.warn("Failed to read runtime state for channel {}: {}", channel.id(), e.getMessage());
            return channel;
        }
    }

    private String asString(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    private void deleteDirectory(Path dir) {
        try {
            if (!Files.exists(dir)) {
                return;
            }
            try (var walk = Files.walk(dir)) {
                walk.sorted(Comparator.reverseOrder())
                        .forEach(path -> {
                            try {
                                Files.deleteIfExists(path);
                            } catch (IOException e) {
                                throw new IllegalStateException("Failed to delete " + path, e);
                            }
                        });
            }
        } catch (IOException e) {
            throw new IllegalStateException("Failed to delete channel directory: " + dir, e);
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readJson(Path file) {
        try {
            if (!Files.exists(file)) {
                return new LinkedHashMap<>();
            }
            String content = Files.readString(file, StandardCharsets.UTF_8);
            if (content.isBlank()) {
                return new LinkedHashMap<>();
            }
            return MAPPER.readValue(content, Map.class);
        } catch (IOException e) {
            log.warn("Failed to read channels file {}: {}", file, e.getMessage());
            return new LinkedHashMap<>();
        }
    }

    private void writeJson(Path file, Map<String, Object> payload) {
        try {
            Files.createDirectories(file.getParent());
            Files.writeString(file,
                    MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(payload),
                    StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to write channels file: " + file, e);
        }
    }

    private void writeJson(Path file, Object payload) {
        try {
            Files.createDirectories(file.getParent());
            Files.writeString(file,
                    MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(payload),
                    StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to write channels file: " + file, e);
        }
    }
}
