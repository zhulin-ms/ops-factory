package com.huawei.opsfactory.gateway.service.channel;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huawei.opsfactory.gateway.config.GatewayProperties;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelBinding;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelDetail;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class ChannelBindingService {

    private static final Logger log = LoggerFactory.getLogger(ChannelBindingService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final GatewayProperties properties;
    private final ChannelConfigService channelConfigService;

    public ChannelBindingService(GatewayProperties properties, ChannelConfigService channelConfigService) {
        this.properties = properties;
        this.channelConfigService = channelConfigService;
    }

    public ChannelBinding ensureBinding(String channelId, String externalUserId) {
        return ensureConversationBinding(channelId, "default", externalUserId, externalUserId, null, "direct");
    }

    public ChannelBinding ensureConversationBinding(String channelId,
                                                    String accountId,
                                                    String peerId,
                                                    String conversationId,
                                                    String threadId,
                                                    String conversationType) {
        ChannelDetail channel = requireChannel(channelId);
        List<ChannelBinding> bindings = new ArrayList<>(readBindings(channelId, channel.type()));
        for (ChannelBinding binding : bindings) {
            if (matches(binding, accountId, conversationId, threadId)) {
                return binding;
            }
        }

        ChannelBinding created = new ChannelBinding(
                channelId,
                normalizeAccountId(accountId),
                peerId,
                conversationId,
                normalizeThreadId(threadId),
                normalizeConversationType(conversationType),
                channel.ownerUserId(),
                buildSyntheticUserId(channel.type(), channelId, accountId, conversationId, threadId),
                channel.defaultAgentId(),
                null,
                null,
                null
        );
        bindings.add(created);
        writeBindings(channelId, channel.type(), bindings);
        channelConfigService.recordEvent(channelId, "info", "binding.created",
                "Created binding for " + summarizeConversation(peerId, conversationId, threadId));
        return created;
    }

    public ChannelBinding attachSession(String channelId, String externalUserId, String sessionId, String agentId) {
        return attachConversationSession(channelId, "default", externalUserId, externalUserId, null, "direct", sessionId, agentId);
    }

    public ChannelBinding attachConversationSession(String channelId,
                                                    String accountId,
                                                    String peerId,
                                                    String conversationId,
                                                    String threadId,
                                                    String conversationType,
                                                    String sessionId,
                                                    String agentId) {
        ChannelDetail channel = requireChannel(channelId);
        List<ChannelBinding> bindings = new ArrayList<>(readBindings(channelId, channel.type()));
        ChannelBinding nextBinding = null;

        for (int i = 0; i < bindings.size(); i++) {
            ChannelBinding binding = bindings.get(i);
            if (!matches(binding, accountId, conversationId, threadId)) {
                continue;
            }
            nextBinding = new ChannelBinding(
                    binding.channelId(),
                    binding.accountId(),
                    choose(peerId, binding.peerId()),
                    binding.conversationId(),
                    binding.threadId(),
                    binding.conversationType(),
                    binding.ownerUserId() == null || binding.ownerUserId().isBlank() ? channel.ownerUserId() : binding.ownerUserId(),
                    binding.syntheticUserId(),
                    agentId,
                    sessionId,
                    binding.lastInboundAt(),
                    binding.lastOutboundAt()
            );
            bindings.set(i, nextBinding);
            break;
        }

        if (nextBinding == null) {
            nextBinding = new ChannelBinding(
                    channelId,
                    normalizeAccountId(accountId),
                    peerId,
                    conversationId,
                    normalizeThreadId(threadId),
                    normalizeConversationType(conversationType),
                    channel.ownerUserId(),
                    buildSyntheticUserId(channel.type(), channelId, accountId, conversationId, threadId),
                    agentId,
                    sessionId,
                    null,
                    null
            );
            bindings.add(nextBinding);
        }

        writeBindings(channelId, channel.type(), bindings);
        channelConfigService.recordEvent(channelId, "info", "binding.session_attached",
                "Bound session " + sessionId + " to " + summarizeConversation(peerId, conversationId, threadId));
        return nextBinding;
    }

    public ChannelBinding markInbound(String channelId, String externalUserId) {
        return markConversationInbound(channelId, "default", externalUserId, null);
    }

    public ChannelBinding markOutbound(String channelId, String externalUserId) {
        return markConversationOutbound(channelId, "default", externalUserId, null);
    }

    public ChannelBinding markConversationInbound(String channelId,
                                                  String accountId,
                                                  String conversationId,
                                                  String threadId) {
        return updateTimestamps(channelId, accountId, conversationId, threadId, Instant.now().toString(), null);
    }

    public ChannelBinding markConversationOutbound(String channelId,
                                                   String accountId,
                                                   String conversationId,
                                                   String threadId) {
        return updateTimestamps(channelId, accountId, conversationId, threadId, null, Instant.now().toString());
    }

    private ChannelBinding updateTimestamps(String channelId,
                                            String accountId,
                                            String conversationId,
                                            String threadId,
                                            String lastInboundAt,
                                            String lastOutboundAt) {
        ChannelDetail channel = requireChannel(channelId);
        List<ChannelBinding> bindings = new ArrayList<>(readBindings(channelId, channel.type()));
        for (int i = 0; i < bindings.size(); i++) {
            ChannelBinding binding = bindings.get(i);
            if (!matches(binding, accountId, conversationId, threadId)) {
                continue;
            }
            ChannelBinding updated = new ChannelBinding(
                    binding.channelId(),
                    binding.accountId(),
                    binding.peerId(),
                    binding.conversationId(),
                    binding.threadId(),
                    binding.conversationType(),
                    binding.ownerUserId(),
                    binding.syntheticUserId(),
                    binding.agentId(),
                    binding.sessionId(),
                    lastInboundAt != null ? lastInboundAt : binding.lastInboundAt(),
                    lastOutboundAt != null ? lastOutboundAt : binding.lastOutboundAt()
            );
            bindings.set(i, updated);
            writeBindings(channelId, channel.type(), bindings);
            return updated;
        }
        throw new IllegalArgumentException("Binding not found for channel '" + channelId + "'");
    }

    private ChannelDetail requireChannel(String channelId) {
        ChannelDetail channel = channelConfigService.getChannel(channelId);
        if (channel == null) {
            throw new IllegalArgumentException("Channel '" + channelId + "' not found");
        }
        return channel;
    }

    private List<ChannelBinding> readBindings(String channelId, String type) {
        Path file = bindingsFile(channelId, type);
        Map<String, Object> wrapper = readJson(file);
        return MAPPER.convertValue(wrapper.getOrDefault("bindings", List.of()),
                new TypeReference<List<ChannelBinding>>() {});
    }

    private void writeBindings(String channelId, String type, List<ChannelBinding> bindings) {
        writeJson(bindingsFile(channelId, type), Map.of("bindings", bindings));
    }

    private Path bindingsFile(String channelId, String type) {
        return properties.getGatewayRootPath()
                .resolve("channels")
                .resolve(type)
                .resolve(channelId)
                .resolve("bindings.json");
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
            log.warn("Failed to read channel bindings {}: {}", file, e.getMessage());
            return new LinkedHashMap<>();
        }
    }

    private void writeJson(Path file, Object payload) {
        try {
            Files.createDirectories(file.getParent());
            Files.writeString(file,
                    MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(payload),
                    StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to write channel bindings: " + file, e);
        }
    }

    private String buildSyntheticUserId(String type,
                                        String channelId,
                                        String accountId,
                                        String conversationId,
                                        String threadId) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            String raw = normalizeAccountId(accountId) + "::" + conversationId + "::" + normalizeThreadId(threadId);
            byte[] hash = digest.digest(raw.getBytes(StandardCharsets.UTF_8));
            String suffix = HexFormat.of().formatHex(hash).substring(0, 24);
            return "channel__" + type + "__" + channelId + "__" + suffix;
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    private boolean matches(ChannelBinding binding, String accountId, String conversationId, String threadId) {
        return normalizeAccountId(accountId).equals(normalizeAccountId(binding.accountId()))
                && normalizeConversationId(conversationId).equals(normalizeConversationId(binding.conversationId()))
                && normalizeThreadId(threadId).equals(normalizeThreadId(binding.threadId()));
    }

    private String choose(String candidate, String fallback) {
        return candidate == null || candidate.isBlank() ? fallback : candidate;
    }

    private String normalizeAccountId(String accountId) {
        return accountId == null || accountId.isBlank() ? "default" : accountId.trim();
    }

    private String normalizeConversationId(String conversationId) {
        return conversationId == null ? "" : conversationId.trim();
    }

    private String normalizeThreadId(String threadId) {
        return threadId == null ? "" : threadId.trim();
    }

    private String normalizeConversationType(String conversationType) {
        return conversationType == null || conversationType.isBlank() ? "direct" : conversationType.trim();
    }

    private String summarizeConversation(String peerId, String conversationId, String threadId) {
        String base = peerId == null || peerId.isBlank() ? conversationId : peerId;
        if (base == null || base.isBlank()) {
            base = "unknown";
        }
        if (threadId != null && !threadId.isBlank()) {
            return base + "@" + threadId;
        }
        return base;
    }

    private String maskExternalUserId(String externalUserId) {
        if (externalUserId == null || externalUserId.length() <= 4) {
            return externalUserId;
        }
        return externalUserId.substring(0, 2) + "***" + externalUserId.substring(externalUserId.length() - 2);
    }
}
