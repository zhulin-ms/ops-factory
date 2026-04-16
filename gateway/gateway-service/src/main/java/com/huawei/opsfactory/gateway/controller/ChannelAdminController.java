package com.huawei.opsfactory.gateway.controller;

import com.huawei.opsfactory.gateway.filter.UserContextFilter;
import com.huawei.opsfactory.gateway.service.channel.ChannelAdapterRegistry;
import com.huawei.opsfactory.gateway.service.channel.ChannelConfigService;
import com.huawei.opsfactory.gateway.service.channel.WeChatLoginService;
import com.huawei.opsfactory.gateway.service.channel.WhatsAppMessagePumpService;
import com.huawei.opsfactory.gateway.service.channel.WhatsAppWebLoginService;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelDetail;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelConnectivityResult;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelLoginState;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelSelfTestRequest;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelSelfTestResult;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelUpsertRequest;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelVerificationResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/gateway/channels")
public class ChannelAdminController {

    private static final Logger log = LoggerFactory.getLogger(ChannelAdminController.class);

    private final ChannelConfigService channelConfigService;
    private final ChannelAdapterRegistry channelAdapterRegistry;
    private final WhatsAppWebLoginService whatsAppWebLoginService;
    private final WhatsAppMessagePumpService whatsAppMessagePumpService;
    private final WeChatLoginService weChatLoginService;

    public ChannelAdminController(ChannelConfigService channelConfigService,
                                  ChannelAdapterRegistry channelAdapterRegistry,
                                  WhatsAppWebLoginService whatsAppWebLoginService,
                                  WhatsAppMessagePumpService whatsAppMessagePumpService,
                                  WeChatLoginService weChatLoginService) {
        this.channelConfigService = channelConfigService;
        this.channelAdapterRegistry = channelAdapterRegistry;
        this.whatsAppWebLoginService = whatsAppWebLoginService;
        this.whatsAppMessagePumpService = whatsAppMessagePumpService;
        this.weChatLoginService = weChatLoginService;
    }

    @GetMapping
    public Mono<Map<String, Object>> listChannels(ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> Map.<String, Object>of("channels", channelConfigService.listChannels()))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/{channelId}")
    public Mono<ResponseEntity<ChannelDetail>> getChannel(@PathVariable String channelId, ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            ChannelDetail detail = channelConfigService.getChannel(channelId);
            if (detail == null) {
                return ResponseEntity.notFound().<ChannelDetail>build();
            }
            return ResponseEntity.ok(detail);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping
    public Mono<ResponseEntity<Map<String, Object>>> createChannel(@RequestBody ChannelUpsertRequest request,
                                                                   ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        String ownerUserId = exchange.getAttribute(UserContextFilter.USER_ID_ATTR);
        return Mono.fromCallable(() -> {
            try {
                ChannelDetail detail = channelConfigService.createChannel(request, ownerUserId != null ? ownerUserId : "admin");
                return ResponseEntity.status(HttpStatus.CREATED)
                        .body(Map.<String, Object>of("success", true, "channel", detail));
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest().body(errorBody(e.getMessage()));
            } catch (Exception e) {
                log.error("Failed to create channel", e);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(errorBody("Failed to create channel"));
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @PutMapping("/{channelId}")
    public Mono<ResponseEntity<Map<String, Object>>> updateChannel(@PathVariable String channelId,
                                                                   @RequestBody ChannelUpsertRequest request,
                                                                   ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            try {
                ChannelDetail detail = channelConfigService.updateChannel(channelId, request);
                return ResponseEntity.ok(Map.<String, Object>of("success", true, "channel", detail));
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest().body(errorBody(e.getMessage()));
            } catch (Exception e) {
                log.error("Failed to update channel {}", channelId, e);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(errorBody("Failed to update channel"));
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/{channelId}/enable")
    public Mono<ResponseEntity<Map<String, Object>>> enableChannel(@PathVariable String channelId,
                                                                   ServerWebExchange exchange) {
        return setEnabled(channelId, true, exchange);
    }

    @PostMapping("/{channelId}/disable")
    public Mono<ResponseEntity<Map<String, Object>>> disableChannel(@PathVariable String channelId,
                                                                    ServerWebExchange exchange) {
        return setEnabled(channelId, false, exchange);
    }

    @DeleteMapping("/{channelId}")
    public Mono<ResponseEntity<Map<String, Object>>> deleteChannel(@PathVariable String channelId,
                                                                   ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            try {
                channelConfigService.deleteChannel(channelId);
                return ResponseEntity.ok(Map.<String, Object>of("success", true));
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest().body(errorBody(e.getMessage()));
            } catch (Exception e) {
                log.error("Failed to delete channel {}", channelId, e);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(errorBody("Failed to delete channel"));
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/{channelId}/bindings")
    public Mono<ResponseEntity<Map<String, Object>>> listBindings(@PathVariable String channelId,
                                                                  ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            try {
                return ResponseEntity.ok(Map.<String, Object>of(
                        "bindings", channelConfigService.listBindings(channelId)));
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest().body(errorBody(e.getMessage()));
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/{channelId}/events")
    public Mono<ResponseEntity<Map<String, Object>>> listEvents(@PathVariable String channelId,
                                                                ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            try {
                return ResponseEntity.ok(Map.<String, Object>of(
                        "events", channelConfigService.listEvents(channelId)));
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest().body(errorBody(e.getMessage()));
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/{channelId}/verify")
    public Mono<ResponseEntity<Map<String, Object>>> verifyChannel(@PathVariable String channelId,
                                                                   ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            try {
                ChannelVerificationResult result = channelConfigService.verifyChannel(channelId);
                return ResponseEntity.ok(Map.<String, Object>of(
                        "success", result.ok(),
                        "verification", result));
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest().body(errorBody(e.getMessage()));
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/{channelId}/probe")
    public Mono<ResponseEntity<Map<String, Object>>> probeChannel(@PathVariable String channelId,
                                                                  ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> channelConfigService.getChannel(channelId))
                .subscribeOn(Schedulers.boundedElastic())
                .flatMap(detail -> {
                    if (detail == null) {
                        return Mono.just(ResponseEntity.badRequest().body(errorBody("Channel '" + channelId + "' not found")));
                    }
                    return channelAdapterRegistry.require(detail.type()).testConnectivity(channelId)
                            .map(result -> ResponseEntity.ok(Map.<String, Object>of(
                                    "success", result.ok(),
                                    "connectivity", result
                            )));
                });
    }

    @GetMapping("/{channelId}/login-state")
    public Mono<ResponseEntity<Map<String, Object>>> getLoginState(@PathVariable String channelId,
                                                                   ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            try {
                ChannelDetail detail = channelConfigService.getChannel(channelId);
                if (detail == null) {
                    return ResponseEntity.badRequest().body(errorBody("Channel '" + channelId + "' not found"));
                }
                ChannelLoginState state = switch (detail.type()) {
                    case "wechat" -> weChatLoginService.getLoginState(channelId);
                    case "whatsapp" -> whatsAppWebLoginService.getLoginState(channelId);
                    default -> throw new IllegalArgumentException(detail.type() + " login is not implemented yet");
                };
                return ResponseEntity.ok(Map.<String, Object>of("state", state));
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest().body(errorBody(e.getMessage()));
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/{channelId}/login")
    public Mono<ResponseEntity<Map<String, Object>>> startLogin(@PathVariable String channelId,
                                                                ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            try {
                ChannelDetail detail = channelConfigService.getChannel(channelId);
                if (detail == null) {
                    return ResponseEntity.badRequest().body(errorBody("Channel '" + channelId + "' not found"));
                }
                ChannelLoginState state = switch (detail.type()) {
                    case "wechat" -> weChatLoginService.startLogin(channelId);
                    case "whatsapp" -> whatsAppWebLoginService.startLogin(channelId);
                    default -> throw new IllegalArgumentException(detail.type() + " login is not implemented yet");
                };
                return ResponseEntity.ok(Map.<String, Object>of("success", true, "state", state));
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest().body(errorBody(e.getMessage()));
            } catch (Exception e) {
                log.error("Failed to start login for channel {}", channelId, e);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(errorBody("Failed to start channel login"));
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/{channelId}/logout")
    public Mono<ResponseEntity<Map<String, Object>>> logout(@PathVariable String channelId,
                                                            ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            try {
                ChannelDetail detail = channelConfigService.getChannel(channelId);
                if (detail == null) {
                    return ResponseEntity.badRequest().body(errorBody("Channel '" + channelId + "' not found"));
                }
                if ("wechat".equals(detail.type())) {
                    weChatLoginService.logout(channelId);
                } else if ("whatsapp".equals(detail.type())) {
                    whatsAppWebLoginService.logout(channelId);
                } else {
                    return ResponseEntity.badRequest().body(errorBody(detail.type() + " login is not implemented yet"));
                }
                detail = channelConfigService.resetChannelRuntimeState(channelId);
                String disconnectedMessage = "wechat".equals(detail.type())
                        ? "WeChat login required"
                        : "WhatsApp Web login required";
                ChannelLoginState state = new ChannelLoginState(
                        detail.id(),
                        "disconnected",
                        disconnectedMessage,
                        detail.config().authStateDir(),
                        "wechat".equals(detail.type()) ? detail.config().wechatId() : detail.config().selfPhone(),
                        detail.config().lastConnectedAt(),
                        detail.config().lastDisconnectedAt(),
                        detail.config().lastError(),
                        null
                );
                return ResponseEntity.ok(Map.<String, Object>of("success", true, "state", state));
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest().body(errorBody(e.getMessage()));
            } catch (Throwable e) {
                log.error("Failed to logout channel {}", channelId, e);
                ChannelDetail detail = channelConfigService.getChannel(channelId);
                if (detail != null) {
                    detail = channelConfigService.resetChannelRuntimeState(channelId);
                }
                if (detail == null) {
                    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                            .body(errorBody(e.getMessage() != null ? e.getMessage() : "Failed to clear channel login state"));
                }
                String disconnectedMessage = "wechat".equals(detail.type())
                        ? "WeChat login required"
                        : "WhatsApp Web login required";
                ChannelLoginState fallbackState = new ChannelLoginState(
                        detail.id(),
                        "disconnected",
                        disconnectedMessage,
                        detail.config().authStateDir(),
                        "wechat".equals(detail.type()) ? detail.config().wechatId() : "",
                        detail.config().lastConnectedAt(),
                        detail.config().lastDisconnectedAt(),
                        "",
                        null
                );
                return ResponseEntity.ok(Map.<String, Object>of("success", true, "state", fallbackState));
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/{channelId}/self-test")
    public Mono<ResponseEntity<Map<String, Object>>> runSelfTest(@PathVariable String channelId,
                                                                 @RequestBody ChannelSelfTestRequest request,
                                                                 ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            try {
                ChannelDetail detail = channelConfigService.getChannel(channelId);
                if (detail == null) {
                    return ResponseEntity.badRequest().body(errorBody("Channel '" + channelId + "' not found"));
                }
                if ("wechat".equals(detail.type())) {
                    return ResponseEntity.badRequest().body(errorBody("wechat self-test is not implemented yet"));
                }
                if (!"whatsapp".equals(detail.type())) {
                    return ResponseEntity.badRequest().body(errorBody(detail.type() + " self-test is not implemented yet"));
                }
                ChannelSelfTestResult result = whatsAppMessagePumpService.runSelfTest(channelId, request.text());
                return ResponseEntity.ok(Map.<String, Object>of("success", true, "result", result));
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest().body(errorBody(e.getMessage()));
            } catch (IllegalStateException e) {
                return ResponseEntity.badRequest().body(errorBody(e.getMessage()));
            } catch (Exception e) {
                log.error("Failed to run self-test for channel {}", channelId, e);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(errorBody("Failed to run WhatsApp self-test"));
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    private Mono<ResponseEntity<Map<String, Object>>> setEnabled(String channelId,
                                                                 boolean enabled,
                                                                 ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            try {
                ChannelDetail detail = channelConfigService.setEnabled(channelId, enabled);
                return ResponseEntity.ok(Map.<String, Object>of("success", true, "channel", detail));
            } catch (IllegalArgumentException e) {
                return ResponseEntity.badRequest().body(errorBody(e.getMessage()));
            } catch (Exception e) {
                log.error("Failed to set enabled={} for channel {}", enabled, channelId, e);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(errorBody("Failed to update channel status"));
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    private Map<String, Object> errorBody(String error) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", false);
        body.put("error", error);
        return body;
    }
}
