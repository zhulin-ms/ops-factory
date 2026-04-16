package com.huawei.opsfactory.gateway.service.channel;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelDetail;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelReplyResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

@Service
public class WeChatMessagePumpService {

    private static final Logger log = LoggerFactory.getLogger(WeChatMessagePumpService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final ChannelConfigService channelConfigService;
    private final ChannelDedupService channelDedupService;
    private final SessionBridgeService sessionBridgeService;

    public WeChatMessagePumpService(ChannelConfigService channelConfigService,
                                    ChannelDedupService channelDedupService,
                                    SessionBridgeService sessionBridgeService) {
        this.channelConfigService = channelConfigService;
        this.channelDedupService = channelDedupService;
        this.sessionBridgeService = sessionBridgeService;
    }

    @Scheduled(fixedDelay = 2000)
    public void pumpInbox() {
        for (var summary : channelConfigService.listChannels()) {
            if (!"wechat".equals(summary.type()) || !summary.enabled()) {
                continue;
            }
            processChannel(summary.id());
        }
    }

    private void processChannel(String channelId) {
        ChannelDetail detail = channelConfigService.getChannel(channelId);
        if (detail == null) {
            return;
        }

        Path inboxDir = inboxDir(detail);
        if (!Files.isDirectory(inboxDir)) {
            return;
        }

        try (var stream = Files.list(inboxDir)) {
            stream.filter(path -> path.getFileName().toString().endsWith(".json"))
                    .sorted()
                    .forEach(path -> processInboundFile(detail, path));
        } catch (IOException e) {
            log.warn("Failed to scan WeChat inbox for {}: {}", channelId, e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private void processInboundFile(ChannelDetail channel, Path file) {
        Map<String, Object> payload;
        try {
            payload = MAPPER.readValue(Files.readString(file, StandardCharsets.UTF_8), Map.class);
        } catch (Exception e) {
            channelConfigService.recordEvent(channel.id(), "warning", "wechat.inbox_invalid",
                    "Failed to parse inbound WeChat file " + file.getFileName());
            moveToProcessed(channel, file, "invalid");
            return;
        }

        String messageId = asString(payload.get("messageId"));
        String peerId = asString(payload.get("peerId"));
        String conversationId = asString(payload.get("conversationId"));
        String text = asString(payload.get("text"));
        String contextToken = asString(payload.get("contextToken"));
        if (messageId == null || peerId == null || conversationId == null || text == null || text.isBlank()) {
            channelConfigService.recordEvent(channel.id(), "warning", "wechat.inbox_invalid",
                    "Inbound WeChat file missing required fields");
            moveToProcessed(channel, file, "invalid");
            return;
        }

        if (!channelDedupService.markIfNew(channel.id(), messageId)) {
            moveToProcessed(channel, file, "duplicate");
            return;
        }

        try {
            ChannelReplyResult reply = sessionBridgeService.sendConversationText(
                            channel.id(),
                            "default",
                            peerId,
                            conversationId,
                            null,
                            "direct",
                            text
                    )
                    .block(Duration.ofMinutes(5));

            if (reply != null && reply.replyText() != null && !reply.replyText().isBlank()) {
                writeOutboxCommand(channel, peerId, reply.replyText(), contextToken);
            }
            moveToProcessed(channel, file, "processed");
        } catch (Exception e) {
            channelConfigService.recordEvent(channel.id(), "warning", "wechat.inbox_failed",
                    "Failed to process inbound WeChat message: " + e.getMessage());
            moveToProcessed(channel, file, "error");
        }
    }

    private void writeOutboxCommand(ChannelDetail channel, String peerId, String text, String contextToken) {
        Path pendingDir = outboxPendingDir(channel);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("id", UUID.randomUUID().toString());
        payload.put("to", peerId);
        payload.put("text", text);
        payload.put("contextToken", contextToken);
        payload.put("createdAt", Instant.now().toString());
        Path file = pendingDir.resolve(payload.get("id") + ".json");
        try {
            Files.createDirectories(pendingDir);
            Files.writeString(file, MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(payload), StandardCharsets.UTF_8);
            channelConfigService.recordEvent(channel.id(), "info", "wechat.outbox_enqueued",
                    "Queued WeChat reply for " + peerId);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to write WeChat outbox command", e);
        }
    }

    private void moveToProcessed(ChannelDetail channel, Path file, String suffix) {
        Path processedDir = processedInboxDir(channel);
        try {
            Files.createDirectories(processedDir);
            Files.move(file, processedDir.resolve(file.getFileName().toString().replace(".json", "-" + suffix + ".json")));
        } catch (IOException e) {
            try {
                Files.deleteIfExists(file);
            } catch (IOException ignored) {
                // ignore
            }
        }
    }

    private Path inboxDir(ChannelDetail channel) {
        return channelConfigService.channelDirectory(channel.type(), channel.id()).resolve("inbox");
    }

    private Path processedInboxDir(ChannelDetail channel) {
        return channelConfigService.channelDirectory(channel.type(), channel.id()).resolve("inbox-processed");
    }

    private Path outboxPendingDir(ChannelDetail channel) {
        return channelConfigService.channelDirectory(channel.type(), channel.id()).resolve("outbox").resolve("pending");
    }

    private String asString(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }
}
