package com.huawei.opsfactory.gateway.controller;

import com.huawei.opsfactory.gateway.config.GatewayProperties;
import com.huawei.opsfactory.gateway.filter.AuthWebFilter;
import com.huawei.opsfactory.gateway.filter.UserContextFilter;
import com.huawei.opsfactory.gateway.process.PrewarmService;
import com.huawei.opsfactory.gateway.service.channel.ChannelAdapterRegistry;
import com.huawei.opsfactory.gateway.service.channel.ChannelConfigService;
import com.huawei.opsfactory.gateway.service.channel.WeChatLoginService;
import com.huawei.opsfactory.gateway.service.channel.WhatsAppMessagePumpService;
import com.huawei.opsfactory.gateway.service.channel.WhatsAppWebLoginService;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelConnectionConfig;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelDetail;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelLoginState;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelVerificationResult;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.WebFluxTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.reactive.server.WebTestClient;

import java.util.List;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@RunWith(SpringRunner.class)
@WebFluxTest(ChannelAdminController.class)
@Import({GatewayProperties.class, AuthWebFilter.class, UserContextFilter.class})
public class ChannelAdminControllerTest {

    @Autowired
    private WebTestClient webTestClient;

    @MockBean
    private ChannelConfigService channelConfigService;

    @MockBean
    private ChannelAdapterRegistry channelAdapterRegistry;

    @MockBean
    private WhatsAppWebLoginService whatsAppWebLoginService;

    @MockBean
    private WhatsAppMessagePumpService whatsAppMessagePumpService;

    @MockBean
    private WeChatLoginService weChatLoginService;

    @MockBean
    private PrewarmService prewarmService;

    @Test
    public void testGetLoginStateDispatchesToWeChatService() {
        when(channelConfigService.getChannel("wechat-main")).thenReturn(channelDetail("wechat"));
        when(weChatLoginService.getLoginState("wechat-main")).thenReturn(
                new ChannelLoginState("wechat-main", "connected", "WeChat session connected", "auth",
                        "wxid_123", "", "", "", null)
        );

        webTestClient.get().uri("/gateway/channels/wechat-main/login-state")
                .header("x-secret-key", "test")
                .header("x-user-id", "admin")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.state.status").isEqualTo("connected")
                .jsonPath("$.state.message").isEqualTo("WeChat session connected");

        verify(weChatLoginService).getLoginState("wechat-main");
        verify(whatsAppWebLoginService, never()).getLoginState(Mockito.anyString());
    }

    @Test
    public void testStartLoginDispatchesToWeChatService() {
        when(channelConfigService.getChannel("wechat-main")).thenReturn(channelDetail("wechat"));
        when(weChatLoginService.startLogin("wechat-main")).thenReturn(
                new ChannelLoginState("wechat-main", "pending", "WeChat QR login is pending", "auth",
                        "wxid_123", "", "", "", "https://example.com/qr.png")
        );

        webTestClient.post().uri("/gateway/channels/wechat-main/login")
                .header("x-secret-key", "test")
                .header("x-user-id", "admin")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.success").isEqualTo(true)
                .jsonPath("$.state.status").isEqualTo("pending");

        verify(weChatLoginService).startLogin("wechat-main");
        verify(whatsAppWebLoginService, never()).startLogin(eq("wechat-main"));
    }

    private ChannelDetail channelDetail(String type) {
        return new ChannelDetail(
                "wechat-main",
                "WeChat Main",
                type,
                true,
                "fo-copilot",
                "admin",
                "2026-04-15T00:00:00Z",
                "2026-04-15T00:00:00Z",
                "",
                new ChannelConnectionConfig("disconnected", "auth", "", "", "", "", "", ""),
                new ChannelVerificationResult(true, List.of()),
                List.of(),
                List.of()
        );
    }
}
