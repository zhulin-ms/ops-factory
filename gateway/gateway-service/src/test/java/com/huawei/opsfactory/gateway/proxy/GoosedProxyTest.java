package com.huawei.opsfactory.gateway.proxy;

import com.huawei.opsfactory.gateway.config.GatewayProperties;
import org.junit.Before;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

public class GoosedProxyTest {

    private GoosedProxy proxy;
    private GoosedProxy proxyTls;

    @Before
    public void setUp() {
        GatewayProperties properties = new GatewayProperties();
        properties.setSecretKey("test-key");
        properties.setGoosedTls(false);
        proxy = new GoosedProxy(properties);

        GatewayProperties tlsProps = new GatewayProperties();
        tlsProps.setSecretKey("test-key");
        tlsProps.setGoosedTls(true);
        proxyTls = new GoosedProxy(tlsProps);
    }

    @Test
    public void testWebClientNotNull() {
        assertNotNull(proxy.getWebClient());
    }




    // ====================== TLS tests ======================

    @Test
    public void testGoosedBaseUrl_tlsDisabled_usesHttp() {
        assertEquals("http://127.0.0.1:9999", proxy.goosedBaseUrl(9999));
    }

    @Test
    public void testGoosedBaseUrl_tlsEnabled_usesHttps() {
        assertEquals("https://127.0.0.1:9999", proxyTls.goosedBaseUrl(9999));
    }

    @Test
    public void testWebClientNotNull_tlsEnabled() {
        assertNotNull(proxyTls.getWebClient());
    }
}
