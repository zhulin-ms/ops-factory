package com.huawei.opsfactory.knowledge.config;

import com.huawei.opsfactory.knowledge.common.logging.MdcTaskDecorator;
import com.huawei.opsfactory.knowledge.infrastructure.db.DatabaseDialect;
import com.huawei.opsfactory.knowledge.infrastructure.db.PostgresqlDialect;
import com.huawei.opsfactory.knowledge.infrastructure.db.SqliteDialect;
import com.zaxxer.hikari.HikariDataSource;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.sql.DataSource;
import org.springframework.boot.autoconfigure.flyway.FlywayConfigurationCustomizer;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.util.StringUtils;

@Configuration
@EnableConfigurationProperties({KnowledgeRuntimeProperties.class, KnowledgeDatabaseProperties.class})
public class RuntimeInfrastructureConfig {

    @Bean
    public DatabaseDialect databaseDialect(KnowledgeDatabaseProperties databaseProperties) {
        return switch (normalizeType(databaseProperties)) {
            case "sqlite" -> new SqliteDialect();
            case "postgresql" -> new PostgresqlDialect();
            default -> throw new IllegalStateException("Unsupported knowledge.database.type: " + databaseProperties.getType());
        };
    }

    @Bean
    public DataSource dataSource(
        KnowledgeRuntimeProperties runtimeProperties,
        KnowledgeDatabaseProperties databaseProperties,
        DatabaseDialect databaseDialect
    ) throws IOException {
        Path baseDir = Path.of(runtimeProperties.getBaseDir()).toAbsolutePath().normalize();
        Files.createDirectories(baseDir);
        Files.createDirectories(baseDir.resolve("meta"));
        Files.createDirectories(baseDir.resolve("upload"));
        Files.createDirectories(baseDir.resolve("artifacts"));
        Files.createDirectories(baseDir.resolve("indexes"));

        HikariDataSource dataSource = new HikariDataSource();
        dataSource.setDriverClassName(resolveDriverClassName(databaseProperties, databaseDialect));
        dataSource.setJdbcUrl(resolveJdbcUrl(baseDir, databaseProperties, databaseDialect));
        if (StringUtils.hasText(databaseProperties.getUsername())) {
            dataSource.setUsername(databaseProperties.getUsername());
        }
        if (StringUtils.hasText(databaseProperties.getPassword())) {
            dataSource.setPassword(databaseProperties.getPassword());
        }
        dataSource.setMaximumPoolSize(databaseProperties.getPool().getMaxSize());
        dataSource.setMinimumIdle(databaseProperties.getPool().getMinIdle());
        dataSource.setPoolName("knowledge-service-db");
        return dataSource;
    }

    @Bean
    public JdbcTemplate jdbcTemplate(DataSource dataSource) {
        return new JdbcTemplate(dataSource);
    }

    @Bean
    public FlywayConfigurationCustomizer flywayConfigurationCustomizer(DatabaseDialect databaseDialect) {
        return configuration -> configuration
            .locations(databaseDialect.flywayLocations().toArray(String[]::new))
            .baselineOnMigrate(true)
            .baselineVersion("1");
    }

    @Bean
    public ThreadPoolTaskExecutor knowledgeTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setThreadNamePrefix("knowledge-maintenance-");
        executor.setCorePoolSize(1);
        executor.setMaxPoolSize(1);
        executor.setQueueCapacity(8);
        executor.setTaskDecorator(new MdcTaskDecorator());
        executor.initialize();
        return executor;
    }

    private String resolveJdbcUrl(
        Path baseDir,
        KnowledgeDatabaseProperties databaseProperties,
        DatabaseDialect databaseDialect
    ) {
        if (StringUtils.hasText(databaseProperties.getUrl())) {
            return databaseProperties.getUrl();
        }

        if ("sqlite".equals(databaseDialect.type())) {
            return "jdbc:sqlite:" + baseDir.resolve("meta").resolve("knowledge.db");
        }
        throw new IllegalStateException("knowledge.database.url is required for " + databaseDialect.type());
    }

    private String resolveDriverClassName(
        KnowledgeDatabaseProperties databaseProperties,
        DatabaseDialect databaseDialect
    ) {
        if (StringUtils.hasText(databaseProperties.getDriverClassName())) {
            return databaseProperties.getDriverClassName();
        }
        return databaseDialect.defaultDriverClassName();
    }

    private String normalizeType(KnowledgeDatabaseProperties databaseProperties) {
        return databaseProperties.getType() == null ? "sqlite" : databaseProperties.getType().trim().toLowerCase();
    }
}
