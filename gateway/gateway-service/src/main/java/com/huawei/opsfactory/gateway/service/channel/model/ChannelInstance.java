package com.huawei.opsfactory.gateway.service.channel.model;

public record ChannelInstance(
        String id,
        String name,
        String type,
        boolean enabled,
        String defaultAgentId,
        String ownerUserId,
        String createdAt,
        String updatedAt,
        ChannelConnectionConfig config
) {
}
