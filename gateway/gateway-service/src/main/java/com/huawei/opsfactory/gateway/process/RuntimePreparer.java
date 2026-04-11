package com.huawei.opsfactory.gateway.process;

import com.huawei.opsfactory.gateway.config.GatewayProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

@Component
public class RuntimePreparer {

    private static final Logger log = LoggerFactory.getLogger(RuntimePreparer.class);

    private final GatewayProperties properties;

    public RuntimePreparer(GatewayProperties properties) {
        this.properties = properties;
    }

    /**
     * Prepare the per-user runtime directory for an agent instance.
     * Creates directories and symlinks to shared agent config.
     *
     * @return the runtime root path for this (agentId, userId)
     */
    public Path prepare(String agentId, String userId) throws IOException {
        Path gatewayRoot = properties.getGatewayRootPath();
        Path agentsDir = gatewayRoot.resolve(properties.getPaths().getAgentsDir());
        Path usersDir = gatewayRoot.resolve(properties.getPaths().getUsersDir());

        Path userAgentDir = usersDir.resolve(userId).resolve("agents").resolve(agentId);
        Files.createDirectories(userAgentDir);

        // Symlink config -> shared agent config
        Path configLink = userAgentDir.resolve("config");
        Path agentConfigDir = agentsDir.resolve(agentId).resolve("config");
        if (!Files.exists(configLink) && Files.exists(agentConfigDir)) {
            Path relative = userAgentDir.relativize(agentConfigDir);
            Files.createSymbolicLink(configLink, relative);
            log.info("Created config symlink: {} -> {}", configLink, relative);
        }

        // Goose memory MCP server resolves global memory via $XDG_CONFIG_HOME/goose/memory/
        // (uses etcetera crate, does NOT respect GOOSE_PATH_ROOT).
        // We set XDG_CONFIG_HOME=<runtimeRoot> and symlink goose/memory -> ../config/memory
        // so the memory extension finds the agent's config/memory/*.txt files.
        Path gooseDir = userAgentDir.resolve("goose");
        Files.createDirectories(gooseDir);
        Path memoryLink = gooseDir.resolve("memory");
        Path configMemoryDir = userAgentDir.resolve("config").resolve("memory");
        if (!Files.exists(memoryLink) && Files.exists(configMemoryDir)) {
            Path relative = gooseDir.relativize(configMemoryDir);
            Files.createSymbolicLink(memoryLink, relative);
            log.info("Created goose memory symlink: {} -> {}", memoryLink, relative);
        }

        // Symlink AGENTS.md
        Path agentsMdLink = userAgentDir.resolve("AGENTS.md");
        Path agentsMdSource = agentsDir.resolve(agentId).resolve("AGENTS.md");
        if (!Files.exists(agentsMdLink) && Files.exists(agentsMdSource)) {
            Path relative = userAgentDir.relativize(agentsMdSource);
            Files.createSymbolicLink(agentsMdLink, relative);
        }

        // Create data and uploads dirs
        Files.createDirectories(userAgentDir.resolve("data"));
        Files.createDirectories(userAgentDir.resolve("uploads"));

        // Windows: goose memory extension uses %APPDATA%\Block\goose\config\memory
        // Create a junction so the memory extension finds the agent's config/memory/*.txt
        if (System.getProperty("os.name", "").toLowerCase().contains("win")) {
            String appData = System.getenv("APPDATA");
            if (appData != null) {
                Path winMemoryDir = Path.of(appData, "Block", "goose", "config", "memory");
                if (Files.exists(configMemoryDir)) {
                    if (Files.exists(winMemoryDir)) {
                        Files.delete(winMemoryDir);
                    }
                    Files.createDirectories(winMemoryDir.getParent());
                    // mklink /J works without admin privileges
                    try {
                        new ProcessBuilder("cmd", "/c", "mklink", "/J",
                            winMemoryDir.toString(), configMemoryDir.toAbsolutePath().toString())
                            .inheritIO().start().waitFor(5, TimeUnit.SECONDS);
                        log.info("Created Windows memory junction: {} -> {}", winMemoryDir, configMemoryDir);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        throw new IOException("Interrupted while creating Windows memory junction", e);
                    }
                }
            }
        }

        return userAgentDir;
    }
}
