package com.huawei.opsfactory.gateway.service.channel.model;

public record ChannelSummary(
        String id,
        String name,
        String type,
        boolean enabled,
        String defaultAgentId,
        String ownerUserId,
        String status,
        String lastInboundAt,
        String lastOutboundAt,
        int bindingCount
) {
}
