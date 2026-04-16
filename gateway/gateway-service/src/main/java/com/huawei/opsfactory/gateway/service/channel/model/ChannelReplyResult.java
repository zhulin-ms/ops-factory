package com.huawei.opsfactory.gateway.service.channel.model;

public record ChannelReplyResult(
        String channelId,
        String accountId,
        String peerId,
        String conversationId,
        String threadId,
        String conversationType,
        String syntheticUserId,
        String agentId,
        String sessionId,
        String replyText
) {
}
