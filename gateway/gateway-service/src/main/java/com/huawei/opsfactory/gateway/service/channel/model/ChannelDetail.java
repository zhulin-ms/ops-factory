package com.huawei.opsfactory.gateway.service.channel.model;

import java.util.List;

public record ChannelDetail(
        String id,
        String name,
        String type,
        boolean enabled,
        String defaultAgentId,
        String ownerUserId,
        String createdAt,
        String updatedAt,
        String webhookPath,
        ChannelConnectionConfig config,
        ChannelVerificationResult verification,
        List<ChannelBinding> bindings,
        List<ChannelEvent> events
) {
}
