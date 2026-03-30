package com.huawei.opsfactory.knowledge.infrastructure.db;

import java.util.List;

public interface DatabaseDialect {

    String type();

    String defaultDriverClassName();

    List<String> flywayLocations();
}
