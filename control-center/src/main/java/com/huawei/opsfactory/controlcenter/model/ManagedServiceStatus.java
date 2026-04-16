package com.huawei.opsfactory.controlcenter.model;

public record ManagedServiceStatus(
        String id,
        String name,
        boolean required,
        String status,
        boolean reachable,
        String host,
        String healthPath,
        long checkedAt,
        String message
) {
}
