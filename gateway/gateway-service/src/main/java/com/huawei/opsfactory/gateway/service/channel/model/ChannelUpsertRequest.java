package com.huawei.opsfactory.gateway.service.channel.model;

public record ChannelUpsertRequest(
        String id,
        String name,
        String type,
        Boolean enabled,
        String defaultAgentId,
        ChannelConnectionConfig config
) {
}
