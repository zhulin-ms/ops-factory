package com.huawei.opsfactory.gateway.service.channel;

import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

public interface ChannelAdapter {

    String type();

    Mono<String> verifyWebhook(String channelId, ServerWebExchange exchange);

    Mono<Void> handleWebhook(String channelId, String rawBody, ServerWebExchange exchange);

    Mono<com.huawei.opsfactory.gateway.service.channel.model.ChannelConnectivityResult> testConnectivity(String channelId);
}
