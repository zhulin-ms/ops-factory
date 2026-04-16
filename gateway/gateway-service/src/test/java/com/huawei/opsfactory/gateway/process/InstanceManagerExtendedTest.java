package com.huawei.opsfactory.gateway.process;

import com.huawei.opsfactory.gateway.common.model.ManagedInstance;
import com.huawei.opsfactory.gateway.config.GatewayProperties;
import com.huawei.opsfactory.gateway.service.AgentConfigService;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Extended tests for InstanceManager covering:
 * - buildEnvironment
 * - Instance limits (per-user and global)
 * - Dead process detection (getOrSpawn with stale entry)
 * - resetStuckRunningSchedules
 */
public class InstanceManagerExtendedTest {

    @Rule
    public TemporaryFolder tempFolder = new TemporaryFolder();

    private InstanceManager instanceManager;
    private GatewayProperties properties;
    private PortAllocator portAllocator;
    private RuntimePreparer runtimePreparer;
    private AgentConfigService agentConfigService;

    @Before
    public void setUp() {
        properties = new GatewayProperties();
        properties.setSecretKey("test-secret");
        portAllocator = mock(PortAllocator.class);
        runtimePreparer = mock(RuntimePreparer.class);
        agentConfigService = mock(AgentConfigService.class);
        when(agentConfigService.loadAgentConfigYaml(anyString())).thenReturn(Map.of());
        when(agentConfigService.loadAgentSecretsYaml(anyString())).thenReturn(Map.of());
        when(agentConfigService.getAgentConfigDir(anyString()))
                .thenAnswer(invocation -> tempFolder.getRoot().toPath().resolve(invocation.getArgument(0, String.class)));

        instanceManager = new InstanceManager(properties, portAllocator, runtimePreparer, agentConfigService,
                3000, false, "");
    }

    // ====================== buildEnvironment ======================

    @Test
    public void testBuildEnvironment_coreEnvVars() throws Exception {
        Path runtimeRoot = tempFolder.getRoot().toPath();
        Path configRoot = tempFolder.getRoot().toPath().resolve("agent-config");
        when(agentConfigService.loadAgentConfigYaml("agent1")).thenReturn(Map.of());
        when(agentConfigService.loadAgentSecretsYaml("agent1")).thenReturn(Map.of());
        when(agentConfigService.getAgentConfigDir("agent1")).thenReturn(configRoot);

        Method buildEnv = InstanceManager.class.getDeclaredMethod(
                "buildEnvironment", String.class, String.class, int.class, Path.class);
        buildEnv.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, String> env = (Map<String, String>) buildEnv.invoke(
                instanceManager, "agent1", "user1", 9000, runtimeRoot);

        assertEquals("9000", env.get("GOOSE_PORT"));
        assertEquals("127.0.0.1", env.get("GOOSE_HOST"));
        String secretKey = env.get("GOOSE_SERVER__SECRET_KEY");
        assertNotNull("Secret key should be set", secretKey);
        assertTrue("Secret key should be a 64-char hex string", secretKey.matches("[0-9a-f]{64}"));
        assertEquals(runtimeRoot.toString(), env.get("GOOSE_PATH_ROOT"));
        assertEquals("1", env.get("GOOSE_DISABLE_KEYRING"));
        assertEquals(configRoot.toAbsolutePath().normalize().toString(), env.get("XDG_CONFIG_HOME"));
    }

    @Test
    public void testBuildEnvironment_mergesAgentConfig() throws Exception {
        Path runtimeRoot = tempFolder.getRoot().toPath();
        Path configRoot = tempFolder.getRoot().toPath().resolve("agent-config");
        when(agentConfigService.loadAgentConfigYaml("agent1")).thenReturn(Map.of(
                "GOOSE_PROVIDER", "openai",
                "GOOSE_MODEL", "gpt-4"
        ));
        when(agentConfigService.loadAgentSecretsYaml("agent1")).thenReturn(Map.of(
                "OPENAI_API_KEY", "sk-test"
        ));
        when(agentConfigService.getAgentConfigDir("agent1")).thenReturn(configRoot);

        Method buildEnv = InstanceManager.class.getDeclaredMethod(
                "buildEnvironment", String.class, String.class, int.class, Path.class);
        buildEnv.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, String> env = (Map<String, String>) buildEnv.invoke(
                instanceManager, "agent1", "user1", 9000, runtimeRoot);

        assertEquals("openai", env.get("GOOSE_PROVIDER"));
        assertEquals("gpt-4", env.get("GOOSE_MODEL"));
        assertEquals("sk-test", env.get("OPENAI_API_KEY"));
        // Core vars still present
        assertEquals("9000", env.get("GOOSE_PORT"));
    }

    @Test
    public void testBuildEnvironment_secretsOverrideConfig() throws Exception {
        Path runtimeRoot = tempFolder.getRoot().toPath();
        Path configRoot = tempFolder.getRoot().toPath().resolve("agent-config");
        when(agentConfigService.loadAgentConfigYaml("agent1")).thenReturn(Map.of(
                "API_KEY", "from-config"
        ));
        when(agentConfigService.loadAgentSecretsYaml("agent1")).thenReturn(Map.of(
                "API_KEY", "from-secrets"
        ));
        when(agentConfigService.getAgentConfigDir("agent1")).thenReturn(configRoot);

        Method buildEnv = InstanceManager.class.getDeclaredMethod(
                "buildEnvironment", String.class, String.class, int.class, Path.class);
        buildEnv.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, String> env = (Map<String, String>) buildEnv.invoke(
                instanceManager, "agent1", "user1", 9000, runtimeRoot);

        // Secrets should override config
        assertEquals("from-secrets", env.get("API_KEY"));
    }

    @Test
    public void testBuildEnvironment_nonScalarValuesSkipped() throws Exception {
        Path runtimeRoot = tempFolder.getRoot().toPath();
        when(agentConfigService.loadAgentConfigYaml("agent1")).thenReturn(Map.of(
                "SIMPLE", "value",
                "NESTED", Map.of("key", "val") // non-scalar, should be skipped
        ));

        Method buildEnv = InstanceManager.class.getDeclaredMethod(
                "buildEnvironment", String.class, String.class, int.class, Path.class);
        buildEnv.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, String> env = (Map<String, String>) buildEnv.invoke(
                instanceManager, "agent1", "user1", 9000, runtimeRoot);

        assertEquals("value", env.get("SIMPLE"));
        assertNull(env.get("NESTED"));
    }

    // ====================== GATEWAY_URL injection ======================

    @Test
    public void testBuildEnvironment_gatewayUrl_httpWhenSslDisabled() throws Exception {
        // Default setUp uses serverSslEnabled=false, serverPort=3000
        Path runtimeRoot = tempFolder.getRoot().toPath();

        Method buildEnv = InstanceManager.class.getDeclaredMethod(
                "buildEnvironment", String.class, String.class, int.class, Path.class);
        buildEnv.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, String> env = (Map<String, String>) buildEnv.invoke(
                instanceManager, "agent1", "user1", 9000, runtimeRoot);

        assertEquals("http://127.0.0.1:3000", env.get("GATEWAY_URL"));
        assertNull("NODE_TLS_REJECT_UNAUTHORIZED should not be set when SSL disabled",
                env.get("NODE_TLS_REJECT_UNAUTHORIZED"));
    }

    @Test
    public void testBuildEnvironment_gatewayUrl_httpsWhenSslEnabled() throws Exception {
        // Create a new InstanceManager with SSL enabled and custom port
        InstanceManager sslManager = new InstanceManager(properties, portAllocator, runtimePreparer,
                agentConfigService, 3443, true, "");

        Path runtimeRoot = tempFolder.getRoot().toPath();

        Method buildEnv = InstanceManager.class.getDeclaredMethod(
                "buildEnvironment", String.class, String.class, int.class, Path.class);
        buildEnv.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, String> env = (Map<String, String>) buildEnv.invoke(
                sslManager, "agent1", "user1", 9000, runtimeRoot);

        assertEquals("https://127.0.0.1:3443", env.get("GATEWAY_URL"));
        assertEquals("0", env.get("NODE_TLS_REJECT_UNAUTHORIZED"));
    }

    @Test
    public void testBuildEnvironment_gatewayUrl_defaultPort() throws Exception {
        InstanceManager defaultManager = new InstanceManager(properties, portAllocator, runtimePreparer,
                agentConfigService, 8080, false, "");

        Path runtimeRoot = tempFolder.getRoot().toPath();

        Method buildEnv = InstanceManager.class.getDeclaredMethod(
                "buildEnvironment", String.class, String.class, int.class, Path.class);
        buildEnv.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, String> env = (Map<String, String>) buildEnv.invoke(
                defaultManager, "agent1", "user1", 9000, runtimeRoot);

        assertEquals("http://127.0.0.1:8080", env.get("GATEWAY_URL"));
    }

    // ====================== GATEWAY_API_PASSWORD injection ======================

    @Test
    public void testBuildEnvironment_gatewayApiPassword_setWhenProvided() throws Exception {
        // Create InstanceManager with API password set
        InstanceManager passwordManager = new InstanceManager(properties, portAllocator, runtimePreparer,
                agentConfigService, 8080, false, "my-secret-password");

        Path runtimeRoot = tempFolder.getRoot().toPath();

        Method buildEnv = InstanceManager.class.getDeclaredMethod(
                "buildEnvironment", String.class, String.class, int.class, Path.class);
        buildEnv.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, String> env = (Map<String, String>) buildEnv.invoke(
                passwordManager, "agent1", "user1", 9000, runtimeRoot);

        assertEquals("my-secret-password", env.get("GATEWAY_API_PASSWORD"));
    }

    @Test
    public void testBuildEnvironment_gatewayApiPassword_setToDifferentValue() throws Exception {
        // Create InstanceManager with a different API password
        InstanceManager passwordManager = new InstanceManager(properties, portAllocator, runtimePreparer,
                agentConfigService, 8080, false, "another-password-123");

        Path runtimeRoot = tempFolder.getRoot().toPath();

        Method buildEnv = InstanceManager.class.getDeclaredMethod(
                "buildEnvironment", String.class, String.class, int.class, Path.class);
        buildEnv.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, String> env = (Map<String, String>) buildEnv.invoke(
                passwordManager, "agent1", "user1", 9000, runtimeRoot);

        assertEquals("another-password-123", env.get("GATEWAY_API_PASSWORD"));
    }

    @Test
    public void testBuildEnvironment_gatewayApiPassword_notSetWhenEmpty() throws Exception {
        // Create InstanceManager with empty API password (default behavior)
        InstanceManager noPasswordManager = new InstanceManager(properties, portAllocator, runtimePreparer,
                agentConfigService, 8080, false, "");

        Path runtimeRoot = tempFolder.getRoot().toPath();

        Method buildEnv = InstanceManager.class.getDeclaredMethod(
                "buildEnvironment", String.class, String.class, int.class, Path.class);
        buildEnv.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, String> env = (Map<String, String>) buildEnv.invoke(
                noPasswordManager, "agent1", "user1", 9000, runtimeRoot);

        assertNull("GATEWAY_API_PASSWORD should not be set when password is empty",
                env.get("GATEWAY_API_PASSWORD"));
    }

    @Test
    public void testBuildEnvironment_gatewayApiPassword_notSetWhenNull() throws Exception {
        // Create InstanceManager with null API password
        InstanceManager nullPasswordManager = new InstanceManager(properties, portAllocator, runtimePreparer,
                agentConfigService, 8080, false, null);

        Path runtimeRoot = tempFolder.getRoot().toPath();

        Method buildEnv = InstanceManager.class.getDeclaredMethod(
                "buildEnvironment", String.class, String.class, int.class, Path.class);
        buildEnv.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, String> env = (Map<String, String>) buildEnv.invoke(
                nullPasswordManager, "agent1", "user1", 9000, runtimeRoot);

        assertNull("GATEWAY_API_PASSWORD should not be set when password is null",
                env.get("GATEWAY_API_PASSWORD"));
    }

    @Test
    public void testBuildEnvironment_gatewayApiPassword_withSpecialCharacters() throws Exception {
        // Test password with special characters to ensure it's properly escaped
        String specialPassword = "p@$$w0rd!#*&^%$";
        InstanceManager specialPasswordManager = new InstanceManager(properties, portAllocator, runtimePreparer,
                agentConfigService, 8080, false, specialPassword);

        Path runtimeRoot = tempFolder.getRoot().toPath();

        Method buildEnv = InstanceManager.class.getDeclaredMethod(
                "buildEnvironment", String.class, String.class, int.class, Path.class);
        buildEnv.setAccessible(true);
        @SuppressWarnings("unchecked")
        Map<String, String> env = (Map<String, String>) buildEnv.invoke(
                specialPasswordManager, "agent1", "user1", 9000, runtimeRoot);

        assertEquals(specialPassword, env.get("GATEWAY_API_PASSWORD"));
    }

    // ====================== getOrSpawn with dead process ======================

    @Test
    public void testGetOrSpawn_deadProcess_removesStaleEntry() {
        Process deadProcess = mock(Process.class);
        when(deadProcess.isAlive()).thenReturn(false);

        ManagedInstance staleInstance = new ManagedInstance("agent1", "user1", 8080, 1234L, deadProcess, "test-secret");
        staleInstance.setStatus(ManagedInstance.Status.RUNNING);
        addInstanceDirectly(staleInstance);

        // getOrSpawn should detect dead process, remove it, then try to spawn
        // Since doSpawn requires a real goosed binary, it will fail
        try {
            instanceManager.getOrSpawn("agent1", "user1").block();
            fail("Expected exception from doSpawn");
        } catch (Exception e) {
            // Expected — doSpawn fails without real binary
        }

        // Stale instance should have been removed
        assertNull(instanceManager.getInstance("agent1", "user1"));
        assertEquals(ManagedInstance.Status.STOPPED, staleInstance.getStatus());
    }

    // ====================== resetStuckRunningSchedules ======================

    @Test
    public void testResetStuckRunningSchedules_fixesStuckJobs() throws Exception {
        File dataDir = tempFolder.newFolder("data");
        File scheduleFile = new File(dataDir, "schedule.json");
        String content = "[{\"id\":\"job1\",\"currently_running\":true,\"current_session_id\":\"s1\"," +
                "\"process_start_time\":\"2024-01-01\"},{\"id\":\"job2\",\"currently_running\":false}]";
        try (FileWriter w = new FileWriter(scheduleFile)) {
            w.write(content);
        }

        Method reset = InstanceManager.class.getDeclaredMethod("resetStuckRunningSchedules", Path.class);
        reset.setAccessible(true);
        reset.invoke(instanceManager, tempFolder.getRoot().toPath());

        String updated = Files.readString(scheduleFile.toPath());
        assertFalse(updated.contains("\"currently_running\" : true"));
        assertTrue(updated.contains("\"currently_running\" : false"));
        // job2 should remain unchanged
        assertTrue(updated.contains("\"id\" : \"job2\""));
    }

    @Test
    public void testResetStuckRunningSchedules_noStuckJobs_noChange() throws Exception {
        File dataDir = tempFolder.newFolder("data");
        File scheduleFile = new File(dataDir, "schedule.json");
        String content = "[{\"id\":\"job1\",\"currently_running\":false}]";
        try (FileWriter w = new FileWriter(scheduleFile)) {
            w.write(content);
        }

        long modifiedBefore = scheduleFile.lastModified();
        Thread.sleep(10);

        Method reset = InstanceManager.class.getDeclaredMethod("resetStuckRunningSchedules", Path.class);
        reset.setAccessible(true);
        reset.invoke(instanceManager, tempFolder.getRoot().toPath());

        // File should not have been modified
        assertEquals(modifiedBefore, scheduleFile.lastModified());
    }

    @Test
    public void testResetStuckRunningSchedules_noScheduleFile_noop() throws Exception {
        // No data/schedule.json exists — should not throw
        Method reset = InstanceManager.class.getDeclaredMethod("resetStuckRunningSchedules", Path.class);
        reset.setAccessible(true);
        reset.invoke(instanceManager, tempFolder.getRoot().toPath());
    }

    // ====================== Instance limit enforcement ======================

    @Test
    public void testPerUserLimitEnforced() {
        properties.getLimits().setMaxInstancesPerUser(2);
        properties.getLimits().setMaxInstancesGlobal(50);

        Process aliveProcess = mock(Process.class);
        when(aliveProcess.isAlive()).thenReturn(true);

        // Add 2 running instances for user1
        ManagedInstance inst1 = new ManagedInstance("agent1", "user1", 8080, 1L, aliveProcess, "test-secret");
        inst1.setStatus(ManagedInstance.Status.RUNNING);
        ManagedInstance inst2 = new ManagedInstance("agent2", "user1", 8081, 2L, aliveProcess, "test-secret");
        inst2.setStatus(ManagedInstance.Status.RUNNING);
        addInstanceDirectly(inst1);
        addInstanceDirectly(inst2);

        // Third spawn for user1 should fail with limit error
        try {
            instanceManager.getOrSpawn("agent3", "user1").block();
            fail("Expected per-user limit error");
        } catch (Exception e) {
            assertTrue(e.getMessage().contains("Per-user instance limit"));
        }
    }

    @Test
    public void testGlobalLimitEnforced() {
        properties.getLimits().setMaxInstancesPerUser(50);
        properties.getLimits().setMaxInstancesGlobal(2);

        Process aliveProcess = mock(Process.class);
        when(aliveProcess.isAlive()).thenReturn(true);

        ManagedInstance inst1 = new ManagedInstance("agent1", "user1", 8080, 1L, aliveProcess, "test-secret");
        inst1.setStatus(ManagedInstance.Status.RUNNING);
        ManagedInstance inst2 = new ManagedInstance("agent1", "user2", 8081, 2L, aliveProcess, "test-secret");
        inst2.setStatus(ManagedInstance.Status.RUNNING);
        addInstanceDirectly(inst1);
        addInstanceDirectly(inst2);

        // Third spawn should fail with global limit error
        try {
            instanceManager.getOrSpawn("agent1", "user3").block();
            fail("Expected global limit error");
        } catch (Exception e) {
            assertTrue(e.getMessage().contains("Global instance limit"));
        }
    }

    @Test
    public void testStoppedInstancesNotCountedForPerUserLimit() {
        properties.getLimits().setMaxInstancesPerUser(1);
        properties.getLimits().setMaxInstancesGlobal(50);

        Process deadProcess = mock(Process.class);
        when(deadProcess.isAlive()).thenReturn(false);

        // Add 1 stopped instance for user1
        ManagedInstance stoppedInst = new ManagedInstance("agent1", "user1", 8080, 1L, deadProcess, "test-secret");
        stoppedInst.setStatus(ManagedInstance.Status.STOPPED);
        addInstanceDirectly(stoppedInst);

        // Spawning a new agent should still fail (doSpawn will fail without binary),
        // but NOT because of per-user limit — the stopped instance doesn't count.
        try {
            instanceManager.getOrSpawn("agent2", "user1").block();
            fail("Expected exception from doSpawn, not limit error");
        } catch (Exception e) {
            // Should fail because goosed binary doesn't exist, not because of per-user limit
            assertFalse(e.getMessage().contains("Per-user instance limit"));
        }
    }

    /**
     * Helper to add instances directly to the internal map via reflection.
     */
    private void addInstanceDirectly(ManagedInstance instance) {
        try {
            java.lang.reflect.Field field = InstanceManager.class.getDeclaredField("instances");
            field.setAccessible(true);
            @SuppressWarnings("unchecked")
            java.util.concurrent.ConcurrentHashMap<String, ManagedInstance> instances =
                    (java.util.concurrent.ConcurrentHashMap<String, ManagedInstance>) field.get(instanceManager);
            instances.put(instance.getKey(), instance);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
