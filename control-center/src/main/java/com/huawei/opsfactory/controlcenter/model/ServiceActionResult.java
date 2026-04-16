package com.huawei.opsfactory.controlcenter.model;

public record ServiceActionResult(
        String serviceId,
        String action,
        boolean success,
        long startedAt,
        long finishedAt,
        int exitCode,
        String message
) {
}
