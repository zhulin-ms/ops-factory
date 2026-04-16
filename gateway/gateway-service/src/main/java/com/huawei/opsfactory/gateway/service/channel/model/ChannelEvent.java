package com.huawei.opsfactory.gateway.service.channel.model;

public record ChannelEvent(
        String id,
        String channelId,
        String level,
        String type,
        String summary,
        String createdAt
) {
}
