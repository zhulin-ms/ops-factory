package com.huawei.opsfactory.gateway.service.channel.adapter;

import com.huawei.opsfactory.gateway.service.channel.ChannelConfigService;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelConnectionConfig;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelDetail;
import com.huawei.opsfactory.gateway.service.channel.model.ChannelVerificationResult;
import org.junit.Before;
import org.junit.Test;
import reactor.test.StepVerifier;

import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

public class WeChatAdapterTest {

    private ChannelConfigService channelConfigService;
    private WeChatAdapter adapter;

    @Before
    public void setUp() {
        channelConfigService = mock(ChannelConfigService.class);
        adapter = new WeChatAdapter(channelConfigService);
    }

    @Test
    public void testConnectedConnectivity() {
        when(channelConfigService.getChannel("wechat-main")).thenReturn(channelWithStatus("connected", ""));

        StepVerifier.create(adapter.testConnectivity("wechat-main"))
                .expectNextMatches(result -> result.ok() && "WeChat session connected".equals(result.message()))
                .verifyComplete();

        verify(channelConfigService).recordEvent("wechat-main", "info", "wechat.status", "WeChat session is connected");
    }

    @Test
    public void testPendingConnectivity() {
        when(channelConfigService.getChannel("wechat-main")).thenReturn(channelWithStatus("pending", ""));

        StepVerifier.create(adapter.testConnectivity("wechat-main"))
                .expectNextMatches(result -> !result.ok() && "WeChat QR login is pending".equals(result.message()))
                .verifyComplete();

        verify(channelConfigService, never()).recordEvent("wechat-main", "info", "wechat.status", "WeChat session is connected");
    }

    @Test
    public void testErrorConnectivityUsesLastError() {
        when(channelConfigService.getChannel("wechat-main")).thenReturn(channelWithStatus("error", "session expired"));

        StepVerifier.create(adapter.testConnectivity("wechat-main"))
                .expectNextMatches(result -> !result.ok() && "session expired".equals(result.message()))
                .verifyComplete();
    }

    private ChannelDetail channelWithStatus(String status, String lastError) {
        return new ChannelDetail(
                "wechat-main",
                "WeChat Main",
                "wechat",
                true,
                "fo-copilot",
                "admin",
                "2026-04-15T00:00:00Z",
                "2026-04-15T00:00:00Z",
                "",
                new ChannelConnectionConfig(status, "auth", "", "", lastError, "", "wxid_123", "Tester"),
                new ChannelVerificationResult(true, List.of()),
                List.of(),
                List.of()
        );
    }
}
