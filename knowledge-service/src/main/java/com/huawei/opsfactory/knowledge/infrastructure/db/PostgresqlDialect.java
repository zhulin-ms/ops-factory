package com.huawei.opsfactory.knowledge.infrastructure.db;

import java.util.List;

public class PostgresqlDialect implements DatabaseDialect {

    @Override
    public String type() {
        return "postgresql";
    }

    @Override
    public String defaultDriverClassName() {
        return "org.postgresql.Driver";
    }

    @Override
    public List<String> flywayLocations() {
        return List.of("classpath:db/migration/common");
    }
}
