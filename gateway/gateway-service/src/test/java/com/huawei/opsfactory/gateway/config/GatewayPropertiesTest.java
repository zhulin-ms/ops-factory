package com.huawei.opsfactory.gateway.config;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class GatewayPropertiesTest {

    @Test
    public void testDefaults() {
        GatewayProperties props = new GatewayProperties();

        assertEquals("test", props.getSecretKey());
        assertEquals("http://127.0.0.1:5173", props.getCorsOrigin());
        assertEquals("goosed", props.getGoosedBin());
    }

    @Test
    public void testPathDefaults() {
        GatewayProperties.Paths paths = new GatewayProperties.Paths();
        assertEquals("..", paths.getProjectRoot());
        assertEquals("agents", paths.getAgentsDir());
        assertEquals("users", paths.getUsersDir());
    }

    @Test
    public void testIdleDefaults() {
        GatewayProperties.Idle idle = new GatewayProperties.Idle();
        assertEquals(15, idle.getTimeoutMinutes());
        assertEquals(60000L, idle.getCheckIntervalMs());
    }

    @Test
    public void testUploadDefaults() {
        GatewayProperties.Upload upload = new GatewayProperties.Upload();
        assertEquals(50, upload.getMaxFileSizeMb());
        assertEquals(20, upload.getMaxImageSizeMb());
    }

    @Test
    public void testOfficePreviewDefaults() {
        GatewayProperties.OfficePreview op = new GatewayProperties.OfficePreview();
        assertFalse(op.isEnabled());
        assertEquals("", op.getOnlyofficeUrl());
    }

    @Test
    public void testSetters() {
        GatewayProperties props = new GatewayProperties();
        props.setSecretKey("new-key");
        props.setCorsOrigin("http://localhost:8080");
        props.setGoosedBin("/usr/bin/goosed");

        assertEquals("new-key", props.getSecretKey());
        assertEquals("http://localhost:8080", props.getCorsOrigin());
        assertEquals("/usr/bin/goosed", props.getGoosedBin());
    }

    @Test
    public void testLangfuseDefaults() {
        GatewayProperties.Langfuse langfuse = new GatewayProperties.Langfuse();
        assertEquals("", langfuse.getHost());
        assertEquals("", langfuse.getPublicKey());
        assertEquals("", langfuse.getSecretKey());
    }

    // ====================== TLS properties ======================

    @Test
    public void testGoosedTlsDefaultTrue() {
        GatewayProperties props = new GatewayProperties();
        assertTrue(props.isGoosedTls());
    }

    @Test
    public void testGoosedTlsSetTrue() {
        GatewayProperties props = new GatewayProperties();
        props.setGoosedTls(true);
        assertTrue(props.isGoosedTls());
    }

    @Test
    public void testGoosedSchemeHttpsWhenTlsTrue() {
        GatewayProperties props = new GatewayProperties();
        props.setGoosedTls(true);
        assertEquals("https", props.goosedScheme());
    }

    @Test
    public void testGoosedSchemeHttpWhenTlsFalse() {
        GatewayProperties props = new GatewayProperties();
        props.setGoosedTls(false);
        assertEquals("http", props.goosedScheme());
    }
}
