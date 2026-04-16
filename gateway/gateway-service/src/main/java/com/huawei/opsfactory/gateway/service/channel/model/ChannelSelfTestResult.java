package com.huawei.opsfactory.gateway.service.channel.model;

public record ChannelSelfTestResult(
        String channelId,
        String selfPhone,
        String agentId,
        String sessionId,
        String replyText
) {
}
