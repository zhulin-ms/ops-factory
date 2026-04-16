package com.huawei.opsfactory.gateway.service.channel.model;

public record ChannelBinding(
        String channelId,
        String accountId,
        String peerId,
        String conversationId,
        String threadId,
        String conversationType,
        String ownerUserId,
        String syntheticUserId,
        String agentId,
        String sessionId,
        String lastInboundAt,
        String lastOutboundAt
) {
}
