package com.huawei.opsfactory.gateway.config;

import org.junit.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

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
    public void testLoggingDefaults() {
        GatewayProperties.Logging logging = new GatewayProperties.Logging();
        assertTrue(logging.isAccessLogEnabled());
        assertFalse(logging.isIncludeUpstreamErrorBody());
        assertFalse(logging.isIncludeSseChunkPreview());
        assertEquals(160, logging.getSseChunkPreviewMaxChars());
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
    public void testLoggingSetters() {
        GatewayProperties.Logging logging = new GatewayProperties.Logging();
        logging.setAccessLogEnabled(false);
        logging.setIncludeUpstreamErrorBody(true);
        logging.setIncludeSseChunkPreview(true);
        logging.setSseChunkPreviewMaxChars(80);

        assertFalse(logging.isAccessLogEnabled());
        assertTrue(logging.isIncludeUpstreamErrorBody());
        assertTrue(logging.isIncludeSseChunkPreview());
        assertEquals(80, logging.getSseChunkPreviewMaxChars());
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
    public void testGooseTlsDefaultTrue() {
        GatewayProperties props = new GatewayProperties();
        assertTrue(props.isGooseTls());
    }

    @Test
    public void testGooseTlsSetTrue() {
        GatewayProperties props = new GatewayProperties();
        props.setGooseTls(true);
        assertTrue(props.isGooseTls());
    }

    @Test
    public void testGooseSchemeHttpsWhenTlsTrue() {
        GatewayProperties props = new GatewayProperties();
        props.setGooseTls(true);
        assertEquals("https", props.gooseScheme());
    }

    @Test
    public void testGooseSchemeHttpWhenTlsFalse() {
        GatewayProperties props = new GatewayProperties();
        props.setGooseTls(false);
        assertEquals("http", props.gooseScheme());
    }

    @Test
    public void testResolvesPathsRelativeToGatewayConfigPath() throws IOException {
        Path tempRoot = Files.createTempDirectory("gateway-props");
        Path gatewayRoot = tempRoot.resolve("gateway");
        Files.createDirectories(gatewayRoot);
        Files.writeString(gatewayRoot.resolve("config.yaml"), "server:\n  port: 3000\n");

        String previous = System.getProperty("GATEWAY_CONFIG_PATH");
        System.setProperty("GATEWAY_CONFIG_PATH", gatewayRoot.resolve("config.yaml").toString());
        try {
            GatewayProperties props = new GatewayProperties();
            GatewayProperties.Paths paths = new GatewayProperties.Paths();
            paths.setProjectRoot("..");
            props.setPaths(paths);

            assertEquals(tempRoot.normalize(), props.getProjectRootPath());
            assertEquals(gatewayRoot.normalize(), props.getGatewayRootPath());
        } finally {
            if (previous == null) {
                System.clearProperty("GATEWAY_CONFIG_PATH");
            } else {
                System.setProperty("GATEWAY_CONFIG_PATH", previous);
            }
        }
    }
}
