package com.huawei.opsfactory.controlcenter.model;

public record ControlCenterEvent(
        long timestamp,
        String type,
        String serviceId,
        String serviceName,
        String level,
        String message
) {
}
