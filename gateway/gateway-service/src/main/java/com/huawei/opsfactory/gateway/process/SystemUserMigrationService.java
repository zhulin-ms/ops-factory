package com.huawei.opsfactory.gateway.process;

import com.huawei.opsfactory.gateway.config.GatewayProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;

@Component("systemUserMigrationService")
public class SystemUserMigrationService {

    static final String LEGACY_SYSTEM_USER = "sys";
    private static final Logger log = LoggerFactory.getLogger(SystemUserMigrationService.class);

    private final GatewayProperties properties;

    public SystemUserMigrationService(GatewayProperties properties) {
        this.properties = properties;
    }

    @PostConstruct
    public void migrateIfNeeded() throws IOException {
        migrateLegacySystemUser();
    }

    void migrateLegacySystemUser() throws IOException {
        Path usersDir = resolveUsersDir();
        Path legacyDir = usersDir.resolve(LEGACY_SYSTEM_USER);
        Path systemDir = usersDir.resolve(com.huawei.opsfactory.gateway.common.constants.GatewayConstants.SYSTEM_USER);

        if (!Files.exists(legacyDir)) {
            return;
        }
        if (Files.exists(systemDir)) {
            mergeLegacyIntoSystemDir(legacyDir, systemDir);
            log.warn("Merged legacy system user directory {} into existing {}", legacyDir, systemDir);
            return;
        }

        Files.createDirectories(usersDir);
        Files.move(legacyDir, systemDir, StandardCopyOption.ATOMIC_MOVE);
        log.warn("Migrated legacy system user directory from {} to {}", legacyDir, systemDir);
    }

    private Path resolveUsersDir() {
        return properties.getGatewayRootPath().resolve(properties.getPaths().getUsersDir());
    }

    private void mergeLegacyIntoSystemDir(Path legacyDir, Path systemDir) throws IOException {
        Files.walk(legacyDir)
                .sorted(Comparator.comparingInt(Path::getNameCount))
                .forEach(source -> {
                    if (source.equals(legacyDir)) {
                        return;
                    }
                    Path relative = legacyDir.relativize(source);
                    Path target = systemDir.resolve(relative);
                    try {
                        if (Files.isDirectory(source)) {
                            Files.createDirectories(target);
                        } else if (!Files.exists(target)) {
                            Files.move(source, target, StandardCopyOption.ATOMIC_MOVE);
                        }
                    } catch (IOException e) {
                        throw new RuntimeException("Failed to merge " + source + " into " + target, e);
                    }
                });

        try {
            Files.walk(legacyDir)
                    .sorted(Comparator.reverseOrder())
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException e) {
                            throw new RuntimeException("Failed to delete legacy path " + path, e);
                        }
                    });
        } catch (RuntimeException e) {
            if (e.getCause() instanceof IOException io) {
                throw io;
            }
            throw e;
        }
    }
}
