package com.huawei.opsfactory.gateway.service.channel.adapter;

import com.huawei.opsfactory.gateway.service.channel.ChannelAdapter;
import com.huawei.opsfactory.gateway.service.channel.ChannelConfigService;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelConnectivityResult;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelConnectionConfig;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelDetail;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import static org.springframework.http.HttpStatus.BAD_REQUEST;

@Service
public class WeChatAdapter implements ChannelAdapter {

    private final ChannelConfigService channelConfigService;

    public WeChatAdapter(ChannelConfigService channelConfigService) {
        this.channelConfigService = channelConfigService;
    }

    @Override
    public String type() {
        return "wechat";
    }

    @Override
    public Mono<String> verifyWebhook(String channelId, ServerWebExchange exchange) {
        return Mono.error(new ResponseStatusException(BAD_REQUEST, "WeChat channel does not use webhooks"));
    }

    @Override
    public Mono<Void> handleWebhook(String channelId, String rawBody, ServerWebExchange exchange) {
        return Mono.error(new ResponseStatusException(BAD_REQUEST, "WeChat channel does not use webhooks"));
    }

    @Override
    public Mono<ChannelConnectivityResult> testConnectivity(String channelId) {
        ChannelDetail channel = requireChannel(channelId);
        ChannelConnectionConfig config = channel.config();
        String status = config.loginStatus() == null || config.loginStatus().isBlank()
                ? "disconnected"
                : config.loginStatus().trim().toLowerCase();

        return switch (status) {
            case "connected" -> {
                channelConfigService.recordEvent(channelId, "info", "wechat.status",
                        "WeChat session is connected");
                yield Mono.just(new ChannelConnectivityResult(true, "WeChat session connected"));
            }
            case "pending" -> Mono.just(new ChannelConnectivityResult(false, "WeChat QR login is pending"));
            case "error" -> Mono.just(new ChannelConnectivityResult(false,
                    config.lastError() == null || config.lastError().isBlank()
                            ? "WeChat connection error"
                            : config.lastError()));
            default -> Mono.just(new ChannelConnectivityResult(false, "WeChat login required"));
        };
    }

    private ChannelDetail requireChannel(String channelId) {
        ChannelDetail detail = channelConfigService.getChannel(channelId);
        if (detail == null) {
            throw new ResponseStatusException(BAD_REQUEST, "Channel not found");
        }
        if (!"wechat".equals(detail.type())) {
            throw new ResponseStatusException(BAD_REQUEST, "Channel is not a WeChat channel");
        }
        return detail;
    }
}
