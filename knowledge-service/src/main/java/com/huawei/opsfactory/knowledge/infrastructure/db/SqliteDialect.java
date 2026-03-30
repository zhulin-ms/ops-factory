package com.huawei.opsfactory.knowledge.infrastructure.db;

import java.util.List;

public class SqliteDialect implements DatabaseDialect {

    @Override
    public String type() {
        return "sqlite";
    }

    @Override
    public String defaultDriverClassName() {
        return "org.sqlite.JDBC";
    }

    @Override
    public List<String> flywayLocations() {
        return List.of("classpath:db/migration/common");
    }
}
