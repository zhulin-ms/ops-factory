package com.huawei.opsfactory.gateway.service.channel;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huawei.opsfactory.gateway.config.GatewayProperties;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelDetail;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class ChannelDedupService {

    private static final Logger log = LoggerFactory.getLogger(ChannelDedupService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final int MAX_MESSAGES = 500;

    private final GatewayProperties properties;
    private final ChannelConfigService channelConfigService;

    public ChannelDedupService(GatewayProperties properties, ChannelConfigService channelConfigService) {
        this.properties = properties;
        this.channelConfigService = channelConfigService;
    }

    public boolean markIfNew(String channelId, String externalMessageId) {
        ChannelDetail channel = requireChannel(channelId);
        Path file = dedupFile(channel.type(), channelId);
        Map<String, Object> wrapper = readJson(file);
        List<Map<String, Object>> messages = castMessages(wrapper.get("messages"));

        boolean exists = messages.stream()
                .anyMatch(item -> externalMessageId.equals(String.valueOf(item.get("externalMessageId"))));
        if (exists) {
            return false;
        }

        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("externalMessageId", externalMessageId);
        entry.put("receivedAt", Instant.now().toString());
        messages.add(entry);
        if (messages.size() > MAX_MESSAGES) {
            messages = messages.subList(messages.size() - MAX_MESSAGES, messages.size());
        }
        writeJson(file, Map.of("messages", messages));
        return true;
    }

    private ChannelDetail requireChannel(String channelId) {
        ChannelDetail channel = channelConfigService.getChannel(channelId);
        if (channel == null) {
            throw new IllegalArgumentException("Channel '" + channelId + "' not found");
        }
        return channel;
    }

    private Path dedupFile(String type, String channelId) {
        return properties.getGatewayRootPath()
                .resolve("channels")
                .resolve(type)
                .resolve(channelId)
                .resolve("inbound-dedup.json");
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> castMessages(Object raw) {
        if (!(raw instanceof List<?> items)) {
            return new ArrayList<>();
        }
        List<Map<String, Object>> messages = new ArrayList<>();
        for (Object item : items) {
            if (!(item instanceof Map<?, ?> rawMap)) {
                continue;
            }
            Map<String, Object> normalized = new LinkedHashMap<>();
            rawMap.forEach((key, value) -> normalized.put(String.valueOf(key), value));
            messages.add(normalized);
        }
        return messages;
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
            log.warn("Failed to read dedup file {}: {}", file, e.getMessage());
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
            throw new IllegalStateException("Failed to write dedup file: " + file, e);
        }
    }
}
