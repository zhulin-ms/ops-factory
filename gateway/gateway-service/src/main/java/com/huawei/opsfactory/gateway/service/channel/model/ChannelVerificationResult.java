package com.huawei.opsfactory.gateway.service.channel.model;

import java.util.List;

public record ChannelVerificationResult(
        boolean ok,
        List<String> issues
) {
}
