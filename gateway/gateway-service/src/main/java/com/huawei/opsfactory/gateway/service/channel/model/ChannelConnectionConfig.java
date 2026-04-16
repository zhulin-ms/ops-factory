package com.huawei.opsfactory.gateway.service.channel.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record ChannelConnectionConfig(
        String loginStatus,
        String authStateDir,
        String lastConnectedAt,
        String lastDisconnectedAt,
        String lastError,
        String selfPhone,
        String wechatId,
        String displayName
) {
}
