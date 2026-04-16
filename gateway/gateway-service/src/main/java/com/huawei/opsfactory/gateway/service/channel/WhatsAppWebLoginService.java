package com.huawei.opsfactory.gateway.service.channel;

import com.huawei.opsfactory.gateway.service.channel.model.ChannelDetail;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelLoginState;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelConnectionConfig;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Comparator;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class WhatsAppWebLoginService {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private final ChannelConfigService channelConfigService;

    public WhatsAppWebLoginService(ChannelConfigService channelConfigService) {
        this.channelConfigService = channelConfigService;
    }

    public ChannelLoginState getLoginState(String channelId) {
        ChannelDetail channel = requireChannel(channelId);
        ChannelConnectionConfig config = channel.config();
        Map<String, Object> runtimeState = readRuntimeState(channel);
        String status = normalizeStatus(config.loginStatus());
        if (runtimeState.get("status") instanceof String runtimeStatus && !runtimeStatus.isBlank()) {
            status = normalizeStatus(runtimeStatus);
        }
        String message = switch (status) {
            case "connected" -> "WhatsApp Web session connected";
            case "pending" -> "Login pending. QR runtime will be attached next.";
            case "error" -> config.lastError() == null || config.lastError().isBlank()
                    ? "WhatsApp Web connection error"
                    : config.lastError();
            default -> "WhatsApp Web login required";
        };

        String stateMessage = asString(runtimeState.get("message"));
        if (stateMessage != null && !stateMessage.isBlank()) {
            message = stateMessage;
        }
        String stateSelfPhone = asString(runtimeState.get("selfPhone"));
        String stateConnectedAt = asString(runtimeState.get("lastConnectedAt"));
        String stateDisconnectedAt = asString(runtimeState.get("lastDisconnectedAt"));
        String stateError = asString(runtimeState.get("lastError"));
        String stateQr = asString(runtimeState.get("qrCodeDataUrl"));

        return new ChannelLoginState(
                channel.id(),
                status,
                message,
                config.authStateDir(),
                stateSelfPhone != null ? stateSelfPhone : config.selfPhone(),
                stateConnectedAt != null ? stateConnectedAt : config.lastConnectedAt(),
                stateDisconnectedAt != null ? stateDisconnectedAt : config.lastDisconnectedAt(),
                stateError != null ? stateError : config.lastError(),
                stateQr
        );
    }

    public ChannelLoginState startLogin(String channelId) {
        ChannelDetail channel = requireChannel(channelId);
        Path authDir = resolveAuthDir(channel);
        Path stateFile = loginStateFile(channel);
        Path pidFile = pidFile(channel);
        Path logFile = logFile(channel);
        Path inboxDir = inboxDir(channel);
        Path outboxPendingDir = outboxPendingDir(channel);
        Path outboxSentDir = outboxSentDir(channel);
        Path outboxErrorDir = outboxErrorDir(channel);
        killIfRunning(pidFile);
        try {
            Files.createDirectories(authDir);
            Files.createDirectories(inboxDir);
            Files.createDirectories(outboxPendingDir);
            Files.createDirectories(outboxSentDir);
            Files.createDirectories(outboxErrorDir);
            Files.createDirectories(logFile.getParent());
        } catch (IOException e) {
            throw new IllegalStateException("Failed to create WhatsApp auth directory", e);
        }

        channelConfigService.updateChannelConfig(channelId, current -> new ChannelConnectionConfig(
                "pending",
                current.authStateDir(),
                current.lastConnectedAt(),
                current.lastDisconnectedAt(),
                "",
                current.selfPhone(),
                current.wechatId(),
                current.displayName()
        ));

        writeInitialStateFile(channel, stateFile);
        startHelperProcess(channel, authDir, stateFile, pidFile, logFile, inboxDir, outboxPendingDir, outboxSentDir, outboxErrorDir);
        channelConfigService.recordEvent(channelId, "info", "whatsapp.login_requested",
                "WhatsApp Web login requested; auth directory prepared at " + authDir);

        return getLoginState(channelId);
    }

    public ChannelLoginState logout(String channelId) {
        ChannelDetail channel = requireChannel(channelId);
        Path authDir = resolveAuthDir(channel);
        Path stateFile = loginStateFile(channel);
        Path pidFile = pidFile(channel);
        try {
            killIfRunning(pidFile);
        } catch (Throwable ignored) {
            // best-effort
        }
        try {
            clearDirectory(authDir);
        } catch (Throwable ignored) {
            // best-effort
        }
        try {
            deleteQuietly(stateFile);
        } catch (Throwable ignored) {
            // best-effort
        }

        ChannelDetail updated = channelConfigService.updateChannelConfig(channelId, current -> new ChannelConnectionConfig(
                "disconnected",
                current.authStateDir(),
                current.lastConnectedAt(),
                Instant.now().toString(),
                "",
                "",
                current.wechatId(),
                current.displayName()
        ));
        channelConfigService.recordEvent(channelId, "info", "whatsapp.logged_out",
                "Cleared WhatsApp Web auth state");

        return new ChannelLoginState(
                updated.id(),
                "disconnected",
                "WhatsApp Web login required",
                updated.config().authStateDir(),
                updated.config().selfPhone(),
                updated.config().lastConnectedAt(),
                updated.config().lastDisconnectedAt(),
                updated.config().lastError(),
                null
        );
    }

    private ChannelDetail requireChannel(String channelId) {
        ChannelDetail channel = channelConfigService.getChannel(channelId);
        if (channel == null) {
            throw new IllegalArgumentException("Channel '" + channelId + "' not found");
        }
        if (!"whatsapp".equals(channel.type())) {
            throw new IllegalArgumentException("Channel '" + channelId + "' is not a WhatsApp channel");
        }
        return channel;
    }

    private Path resolveAuthDir(ChannelDetail channel) {
        String configured = channel.config().authStateDir();
        Path channelRoot = channelConfigService.channelDirectory(channel.type(), channel.id());
        Path relative = Path.of(configured == null || configured.isBlank() ? "auth" : configured);
        return relative.isAbsolute() ? relative.normalize() : channelRoot.resolve(relative).normalize();
    }

    private Path loginStateFile(ChannelDetail channel) {
        return channelConfigService.channelDirectory(channel.type(), channel.id()).resolve("login-state.json");
    }

    private Path pidFile(ChannelDetail channel) {
        return channelConfigService.channelDirectory(channel.type(), channel.id()).resolve("login.pid");
    }

    private Path logFile(ChannelDetail channel) {
        return channelConfigService.channelDirectory(channel.type(), channel.id()).resolve("login.log");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readRuntimeState(ChannelDetail channel) {
        Path stateFile = loginStateFile(channel);
        try {
            if (!Files.exists(stateFile)) {
                return Map.of();
            }
            String raw = Files.readString(stateFile, StandardCharsets.UTF_8);
            if (raw.isBlank()) {
                return Map.of();
            }
            return MAPPER.readValue(raw, Map.class);
        } catch (IOException e) {
            return Map.of();
        }
    }

    private String asString(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    private void writeInitialStateFile(ChannelDetail channel, Path stateFile) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("channelId", channel.id());
        payload.put("status", "pending");
        payload.put("message", "Initializing WhatsApp Web helper...");
        payload.put("authStateDir", channel.config().authStateDir());
        payload.put("selfPhone", channel.config().selfPhone());
        payload.put("lastConnectedAt", channel.config().lastConnectedAt());
        payload.put("lastDisconnectedAt", channel.config().lastDisconnectedAt());
        payload.put("lastError", "");
        payload.put("qrCodeDataUrl", null);
        try {
            Files.writeString(stateFile, MAPPER.writerWithDefaultPrettyPrinter().writeValueAsString(payload), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to write WhatsApp login state file", e);
        }
    }

    private void startHelperProcess(ChannelDetail channel,
                                    Path authDir,
                                    Path stateFile,
                                    Path pidFile,
                                    Path logFile,
                                    Path inboxDir,
                                    Path outboxPendingDir,
                                    Path outboxSentDir,
                                    Path outboxErrorDir) {
        Path helperDir = channelConfigService.getGatewayRoot().resolve("tools").resolve("whatsapp-web-helper");
        Path helperEntry = helperDir.resolve("index.js");
        if (!Files.exists(helperEntry)) {
            throw new IllegalStateException("WhatsApp Web helper not found: " + helperEntry);
        }

        List<String> command = new ArrayList<>();
        command.add("node");
        command.add(helperEntry.toString());
        command.add("--command");
        command.add("login");
        command.add("--channel-id");
        command.add(channel.id());
        command.add("--state-file");
        command.add(stateFile.toString());
        command.add("--pid-file");
        command.add(pidFile.toString());
        command.add("--auth-dir");
        command.add(authDir.toString());
        command.add("--inbox-dir");
        command.add(inboxDir.toString());
        command.add("--outbox-pending-dir");
        command.add(outboxPendingDir.toString());
        command.add("--outbox-sent-dir");
        command.add(outboxSentDir.toString());
        command.add("--outbox-error-dir");
        command.add(outboxErrorDir.toString());

        if (channel.config().selfPhone() != null && !channel.config().selfPhone().isBlank()) {
            command.add("--self-phone");
            command.add(channel.config().selfPhone());
        }

        ProcessBuilder builder = new ProcessBuilder(command);
        builder.directory(helperDir.toFile());
        builder.redirectErrorStream(true);
        builder.redirectOutput(ProcessBuilder.Redirect.appendTo(logFile.toFile()));
        try {
            builder.start();
        } catch (IOException e) {
            throw new IllegalStateException("Failed to start WhatsApp Web helper", e);
        }
    }

    private void killIfRunning(Path pidFile) {
        try {
            if (!Files.exists(pidFile)) {
                return;
            }
            String raw = Files.readString(pidFile, StandardCharsets.UTF_8).trim();
            if (raw.isBlank()) {
                Files.deleteIfExists(pidFile);
                return;
            }
            Map<String, Object> pidPayload = MAPPER.readValue(raw, Map.class);
            Object pidObj = pidPayload.get("pid");
            if (!(pidObj instanceof Number number)) {
                Files.deleteIfExists(pidFile);
                return;
            }
            long pid = number.longValue();
            ProcessHandle.of(pid).ifPresent(handle -> {
                handle.destroy();
                try {
                    handle.onExit().get();
                } catch (Exception ignored) {
                    handle.destroyForcibly();
                }
            });
            Files.deleteIfExists(pidFile);
        } catch (Exception ignored) {
            try {
                Files.deleteIfExists(pidFile);
            } catch (IOException ignoredAgain) {
                // ignore
            }
        }
    }

    private Path inboxDir(ChannelDetail channel) {
        return channelConfigService.channelDirectory(channel.type(), channel.id()).resolve("inbox");
    }

    private Path outboxPendingDir(ChannelDetail channel) {
        return channelConfigService.channelDirectory(channel.type(), channel.id()).resolve("outbox").resolve("pending");
    }

    private Path outboxSentDir(ChannelDetail channel) {
        return channelConfigService.channelDirectory(channel.type(), channel.id()).resolve("outbox").resolve("sent");
    }

    private Path outboxErrorDir(ChannelDetail channel) {
        return channelConfigService.channelDirectory(channel.type(), channel.id()).resolve("outbox").resolve("error");
    }

    private void clearDirectory(Path dir) {
        if (dir == null || !Files.exists(dir)) {
            return;
        }
        try (var walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder())
                    .forEach(this::deleteQuietly);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to clear directory " + dir, e);
        }
    }

    private void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (IOException ignored) {
            // best-effort cleanup
        }
    }

    private String normalizeStatus(String raw) {
        if (raw == null || raw.isBlank()) {
            return "disconnected";
        }
        return raw.trim().toLowerCase();
    }
}
