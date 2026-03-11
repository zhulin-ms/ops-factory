package com.huawei.opsfactory.gateway.proxy;

import com.huawei.opsfactory.gateway.config.GatewayProperties;
import org.junit.Before;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

public class GoosedProxyTest {

    private GoosedProxy proxy;
    private GoosedProxy proxyNoTls;

    @Before
    public void setUp() {
        GatewayProperties properties = new GatewayProperties();
        properties.setSecretKey("test-key");
        // Default: goosedTls = true
        proxy = new GoosedProxy(properties);

        GatewayProperties noTlsProps = new GatewayProperties();
        noTlsProps.setSecretKey("test-key");
        noTlsProps.setGoosedTls(false);
        proxyNoTls = new GoosedProxy(noTlsProps);
    }

    @Test
    public void testWebClientNotNull() {
        assertNotNull(proxy.getWebClient());
    }

    @Test
    public void testSecretKey() {
        assertEquals("test-key", proxy.getSecretKey());
    }

    // ====================== TLS tests ======================

    @Test
    public void testGoosedBaseUrl_tlsEnabled_usesHttps() {
        assertEquals("https://127.0.0.1:9999", proxy.goosedBaseUrl(9999));
    }

    @Test
    public void testGoosedBaseUrl_tlsDisabled_usesHttp() {
        assertEquals("http://127.0.0.1:9999", proxyNoTls.goosedBaseUrl(9999));
    }

    @Test
    public void testWebClientNotNull_tlsDisabled() {
        assertNotNull(proxyNoTls.getWebClient());
    }
}
