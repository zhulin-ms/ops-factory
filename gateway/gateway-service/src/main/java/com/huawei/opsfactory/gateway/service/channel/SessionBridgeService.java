package com.huawei.opsfactory.gateway.service.channel;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huawei.opsfactory.gateway.common.model.ManagedInstance;
import com.huawei.opsfactory.gateway.proxy.GoosedProxy;
import com.huawei.opsfactory.gateway.process.InstanceManager;
import com.huawei.opsfactory.gateway.service.AgentConfigService;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelBinding;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelDetail;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelReplyResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class SessionBridgeService {

    private static final Logger log = LoggerFactory.getLogger(SessionBridgeService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final ChannelConfigService channelConfigService;
    private final ChannelBindingService channelBindingService;
    private final InstanceManager instanceManager;
    private final GoosedProxy goosedProxy;
    private final AgentConfigService agentConfigService;
    private final WebClient webClient;

    public SessionBridgeService(ChannelConfigService channelConfigService,
                                ChannelBindingService channelBindingService,
                                InstanceManager instanceManager,
                                GoosedProxy goosedProxy,
                                AgentConfigService agentConfigService) {
        this.channelConfigService = channelConfigService;
        this.channelBindingService = channelBindingService;
        this.instanceManager = instanceManager;
        this.goosedProxy = goosedProxy;
        this.agentConfigService = agentConfigService;
        this.webClient = goosedProxy.getWebClient();
    }

    public Mono<ChannelBinding> ensureSession(String channelId, String externalUserId) {
        return ensureConversationSession(channelId, "default", externalUserId, externalUserId, null, "direct");
    }

    public Mono<ChannelBinding> ensureConversationSession(String channelId,
                                                          String accountId,
                                                          String peerId,
                                                          String conversationId,
                                                          String threadId,
                                                          String conversationType) {
        ChannelDetail channel = requireChannel(channelId);
        ChannelBinding binding = channelBindingService.ensureConversationBinding(
                channelId, accountId, peerId, conversationId, threadId, conversationType);
        if (binding.sessionId() != null && !binding.sessionId().isBlank()) {
            return Mono.just(binding);
        }

        return startSession(channel.defaultAgentId(), binding.syntheticUserId())
                .map(sessionId -> channelBindingService.attachConversationSession(
                        channelId,
                        accountId,
                        peerId,
                        conversationId,
                        threadId,
                        conversationType,
                        sessionId,
                        channel.defaultAgentId()
                ));
    }

    public Mono<ChannelReplyResult> sendText(String channelId, String externalUserId, String text) {
        return sendConversationText(channelId, "default", externalUserId, externalUserId, null, "direct", text);
    }

    public Mono<ChannelReplyResult> sendConversationText(String channelId,
                                                         String accountId,
                                                         String peerId,
                                                         String conversationId,
                                                         String threadId,
                                                         String conversationType,
                                                         String text) {
        ChannelDetail channel = requireChannel(channelId);
        if (text == null || text.isBlank()) {
            return Mono.error(new IllegalArgumentException("Text is required"));
        }

        return ensureConversationSession(channelId, accountId, peerId, conversationId, threadId, conversationType)
                .flatMap(binding -> {
                    channelBindingService.markConversationInbound(channelId, accountId, conversationId, threadId);
                    String ownerUserId = binding.ownerUserId() == null || binding.ownerUserId().isBlank()
                            ? channel.ownerUserId()
                            : binding.ownerUserId();
                    return sendTextToSession(binding.agentId(), ownerUserId, binding.sessionId(), text.trim())
                            .onErrorResume(WebClientResponseException.class, error -> {
                                if (error.getStatusCode().value() != 404) {
                                    return Mono.error(error);
                                }
                                return startSession(binding.agentId(), ownerUserId)
                                        .map(sessionId -> channelBindingService.attachConversationSession(
                                                channelId,
                                                accountId,
                                                peerId,
                                                conversationId,
                                                threadId,
                                                conversationType,
                                                sessionId,
                                                binding.agentId()
                                        ))
                                        .flatMap(rebound -> sendTextToSession(
                                                rebound.agentId(),
                                                ownerUserId,
                                                rebound.sessionId(),
                                                text.trim()
                                        ));
                            })
                            .onErrorResume(IllegalStateException.class, error -> {
                                String message = error.getMessage() == null ? "" : error.getMessage();
                                if (!message.contains("404")) {
                                    return Mono.error(error);
                                }
                                return startSession(binding.agentId(), ownerUserId)
                                        .map(sessionId -> channelBindingService.attachConversationSession(
                                                channelId,
                                                accountId,
                                                peerId,
                                                conversationId,
                                                threadId,
                                                conversationType,
                                                sessionId,
                                                binding.agentId()
                                        ))
                                        .flatMap(rebound -> sendTextToSession(
                                                rebound.agentId(),
                                                ownerUserId,
                                                rebound.sessionId(),
                                                text.trim()
                                        ));
                            })
                            .map(replyText -> {
                                channelBindingService.markConversationOutbound(channelId, accountId, conversationId, threadId);
                                channelConfigService.recordEvent(channelId, "info", "session.reply",
                                        "Delivered text reply for session " + binding.sessionId());
                                return new ChannelReplyResult(
                                        channelId,
                                        binding.accountId(),
                                        binding.peerId(),
                                        binding.conversationId(),
                                        binding.threadId(),
                                        binding.conversationType(),
                                        ownerUserId,
                                        binding.agentId(),
                                        binding.sessionId(),
                                        replyText
                                );
                            });
                });
    }

    private Mono<String> startSession(String agentId, String ownerUserId) {
        Path workingDir = agentConfigService.getUserAgentDir(ownerUserId, agentId)
                .toAbsolutePath().normalize();
        String requestBody;
        try {
            requestBody = MAPPER.writeValueAsString(Map.of("working_dir", workingDir.toString()));
        } catch (Exception e) {
            return Mono.error(new IllegalStateException("Failed to build session start payload", e));
        }

        return instanceManager.getOrSpawn(agentId, ownerUserId)
                .flatMap(instance -> goosedProxy.fetchJson(
                                instance.getPort(),
                                HttpMethod.POST,
                                "/agent/start",
                                requestBody,
                                120,
                                instance.getSecretKey()
                        )
                        .flatMap(startResponse -> {
                            String sessionId = extractSessionId(startResponse);
                            String resumeBody;
                            try {
                                resumeBody = MAPPER.writeValueAsString(Map.of(
                                        "session_id", sessionId,
                                        "load_model_and_extensions", true
                                ));
                            } catch (Exception e) {
                                return Mono.error(new IllegalStateException("Failed to build session resume payload", e));
                            }
                            return goosedProxy.fetchJson(
                                            instance.getPort(),
                                            HttpMethod.POST,
                                            "/agent/resume",
                                            resumeBody,
                                            120,
                                            instance.getSecretKey()
                                    )
                                    .thenReturn(sessionId);
                        }));
    }

    private Mono<String> sendTextToSession(String agentId,
                                           String ownerUserId,
                                           String sessionId,
                                           String text) {
        return instanceManager.getOrSpawn(agentId, ownerUserId)
                .flatMap(instance -> resumeSession(instance, sessionId)
                        .thenMany(streamReply(instance, sessionId, text))
                        .collectList()
                        .map(events -> extractFinalAssistantText(events, sessionId)));
    }

    private Mono<String> resumeSession(ManagedInstance instance, String sessionId) {
        try {
            String resumeBody = MAPPER.writeValueAsString(Map.of(
                    "session_id", sessionId,
                    "load_model_and_extensions", true
            ));
            return goosedProxy.fetchJson(
                            instance.getPort(),
                            HttpMethod.POST,
                            "/agent/resume",
                            resumeBody,
                            120,
                            instance.getSecretKey()
                    )
                    .thenReturn(sessionId);
        } catch (Exception e) {
            return Mono.error(new IllegalStateException("Failed to build session resume payload", e));
        }
    }

    private Flux<Map<String, Object>> streamReply(ManagedInstance instance, String sessionId, String text) {
        String body;
        try {
            Map<String, Object> userMessage = new LinkedHashMap<>();
            userMessage.put("role", "user");
            userMessage.put("created", Math.floorDiv(System.currentTimeMillis(), 1000));
            userMessage.put("content", List.of(Map.of("type", "text", "text", text)));
            userMessage.put("metadata", Map.of("userVisible", true, "agentVisible", true));

            body = MAPPER.writeValueAsString(Map.of(
                    "session_id", sessionId,
                    "user_message", userMessage
            ));
        } catch (Exception e) {
            return Flux.error(new IllegalStateException("Failed to build reply payload", e));
        }

        String target = goosedProxy.goosedBaseUrl(instance.getPort()) + "/reply";
        return webClient.post()
                .uri(target)
                .header("x-secret-key", instance.getSecretKey())
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .bodyValue(body)
                .retrieve()
                .bodyToFlux(DataBuffer.class)
                .transform(this::decodeSseEvents)
                .timeout(Duration.ofMinutes(5))
                .map(this::parseEventJson);
    }

    private Flux<String> decodeSseEvents(Flux<DataBuffer> buffers) {
        return Flux.create(sink -> {
            StringBuilder buffer = new StringBuilder();
            buffers.subscribe(dataBuffer -> {
                byte[] bytes = new byte[dataBuffer.readableByteCount()];
                dataBuffer.read(bytes);
                buffer.append(new String(bytes, StandardCharsets.UTF_8));

                int separatorIndex;
                while ((separatorIndex = buffer.indexOf("\n\n")) >= 0) {
                    String eventBlock = buffer.substring(0, separatorIndex);
                    buffer.delete(0, separatorIndex + 2);

                    StringBuilder dataLines = new StringBuilder();
                    for (String line : eventBlock.split("\n")) {
                        String trimmed = line.replace("\r", "");
                        if (trimmed.startsWith("data:")) {
                            if (!dataLines.isEmpty()) {
                                dataLines.append('\n');
                            }
                            dataLines.append(trimmed.substring(5).trim());
                        }
                    }
                    if (!dataLines.isEmpty()) {
                        sink.next(dataLines.toString());
                    }
                }
            }, sink::error, sink::complete);
        });
    }

    private Map<String, Object> parseEventJson(String json) {
        try {
            return MAPPER.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            throw new IllegalStateException("Failed to parse SSE event: " + json, e);
        }
    }

    @SuppressWarnings("unchecked")
    private String extractFinalAssistantText(List<Map<String, Object>> events, String sessionId) {
        StringBuilder output = new StringBuilder();

        for (Map<String, Object> event : events) {
            Object typeObj = event.get("type");
            String type = typeObj != null ? String.valueOf(typeObj) : "";

            if ("Error".equals(type)) {
                Object error = event.get("error");
                throw new IllegalStateException(error != null ? String.valueOf(error) : "Unknown reply error");
            }

            if (!"Message".equals(type)) {
                continue;
            }

            Object rawMessage = event.get("message");
            if (!(rawMessage instanceof Map<?, ?> message)) {
                continue;
            }

            Object role = message.get("role");
            if (!"assistant".equals(role)) {
                continue;
            }

            Object rawMetadata = message.get("metadata");
            if (rawMetadata instanceof Map<?, ?> metadata) {
                Object userVisible = metadata.get("userVisible");
                if (Boolean.FALSE.equals(userVisible)) {
                    continue;
                }
            }

            Object rawContent = message.get("content");
            if (!(rawContent instanceof List<?> contentItems)) {
                continue;
            }

            for (Object item : contentItems) {
                if (!(item instanceof Map<?, ?> content)) {
                    continue;
                }
                if (!"text".equals(content.get("type"))) {
                    continue;
                }
                Object textPart = content.get("text");
                if (textPart != null) {
                    output.append(textPart);
                }
            }
        }

        String reply = output.toString().trim();
        if (reply.isBlank()) {
            log.warn("No assistant text extracted for session {}", sessionId);
        }
        return reply;
    }

    private String extractSessionId(String startResponse) {
        try {
            Map<String, Object> map = MAPPER.readValue(startResponse, new TypeReference<Map<String, Object>>() {});
            Object id = map.get("id");
            if (id == null) {
                throw new IllegalStateException("Session ID missing from start response");
            }
            return id.toString();
        } catch (Exception e) {
            throw new IllegalStateException("Failed to parse session start response", e);
        }
    }

    private ChannelDetail requireChannel(String channelId) {
        ChannelDetail channel = channelConfigService.getChannel(channelId);
        if (channel == null) {
            throw new IllegalArgumentException("Channel '" + channelId + "' not found");
        }
        return channel;
    }
}
