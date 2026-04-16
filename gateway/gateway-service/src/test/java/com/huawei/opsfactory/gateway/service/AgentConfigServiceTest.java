package com.huawei.opsfactory.gateway.service;

import com.huawei.opsfactory.gateway.common.model.AgentRegistryEntry;
import com.huawei.opsfactory.gateway.config.GatewayProperties;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

public class AgentConfigServiceTest {

    @Rule
    public TemporaryFolder tempFolder = new TemporaryFolder();

    private AgentConfigService service;
    private GatewayProperties properties;
    private Path gatewayRoot;
    private String previousGatewayConfigPath;

    @Before
    public void setUp() throws IOException {
        gatewayRoot = tempFolder.getRoot().toPath().resolve("gateway");
        Files.createDirectories(gatewayRoot.resolve("config"));
        Files.createDirectories(gatewayRoot.resolve("agents"));
        Files.createDirectories(gatewayRoot.resolve("users"));

        String configYaml = "port: 3000\n"
                + "residentInstances:\n"
                + "  enabled: true\n"
                + "  entries:\n"
                + "    - userId: admin\n"
                + "      agentIds: ['*']\n"
                + "    - userId: robby\n"
                + "      agentIds: ['test-agent']\n"
                + "agents:\n"
                + "  - id: test-agent\n"
                + "    name: Test Agent\n"
                + "  - id: kb-agent\n"
                + "    name: KB Agent\n";
        Files.writeString(gatewayRoot.resolve("config.yaml"), configYaml);

        properties = new GatewayProperties();
        GatewayProperties.Paths paths = new GatewayProperties.Paths();
        paths.setProjectRoot(tempFolder.getRoot().getAbsolutePath());
        properties.setPaths(paths);
        previousGatewayConfigPath = System.getProperty("GATEWAY_CONFIG_PATH");
        System.setProperty("GATEWAY_CONFIG_PATH", gatewayRoot.resolve("config.yaml").toString());

        service = new AgentConfigService(properties);
        service.loadRegistry();
    }

    @After
    public void tearDown() {
        if (previousGatewayConfigPath == null) {
            System.clearProperty("GATEWAY_CONFIG_PATH");
        } else {
            System.setProperty("GATEWAY_CONFIG_PATH", previousGatewayConfigPath);
        }
    }

    @Test
    public void testLoadRegistry() {
        List<AgentRegistryEntry> registry = service.getRegistry();
        assertEquals(2, registry.size());
        assertEquals("test-agent", registry.get(0).id());
        assertEquals("Test Agent", registry.get(0).name());
        assertEquals("kb-agent", registry.get(1).id());
        assertEquals("KB Agent", registry.get(1).name());
    }

    @Test
    public void testLoadRegistryWhenGatewayConfigPathPointsToGatewayConfig() throws IOException {
        Path externalRoot = tempFolder.getRoot().toPath().resolve("external-runtime");
        Path externalGatewayRoot = externalRoot.resolve("gateway");
        Files.createDirectories(externalGatewayRoot.resolve("agents"));
        Files.createDirectories(externalGatewayRoot.resolve("users"));
        Files.writeString(externalGatewayRoot.resolve("config.yaml"),
                "agents:\n" +
                        "  - id: external-agent\n" +
                        "    name: External Agent\n");

        GatewayProperties externalProperties = new GatewayProperties();
        GatewayProperties.Paths paths = new GatewayProperties.Paths();
        paths.setProjectRoot("..");
        externalProperties.setPaths(paths);

        String previous = System.getProperty("GATEWAY_CONFIG_PATH");
        System.setProperty("GATEWAY_CONFIG_PATH", externalGatewayRoot.resolve("config.yaml").toString());
        try {
            AgentConfigService externalService = new AgentConfigService(externalProperties);
            externalService.loadRegistry();

            assertEquals(1, externalService.getRegistry().size());
            assertEquals("external-agent", externalService.getRegistry().get(0).id());
            assertEquals(externalGatewayRoot.normalize(), externalService.getGatewayRoot());
        } finally {
            if (previous == null) {
                System.clearProperty("GATEWAY_CONFIG_PATH");
            } else {
                System.setProperty("GATEWAY_CONFIG_PATH", previous);
            }
        }
    }

    @Test
    public void testLoadResidentInstances_expandsWildcardAndSpecificAgent() {
        assertTrue(service.isResidentInstance("test-agent", "admin"));
        assertTrue(service.isResidentInstance("kb-agent", "admin"));
        assertTrue(service.isResidentInstance("test-agent", "robby"));
        assertFalse(service.isResidentInstance("kb-agent", "robby"));
        assertEquals(3, service.getResidentInstances().size());
    }

    @Test
    public void testLoadResidentInstances_ignoresUnknownAndDuplicateAgents() throws IOException {
        String configYaml = "agents:\n"
                + "  - id: agent-a\n    name: Agent A\n"
                + "  - id: agent-b\n    name: Agent B\n"
                + "residentInstances:\n"
                + "  enabled: true\n"
                + "  entries:\n"
                + "    - userId: admin\n"
                + "      agentIds: ['agent-a', 'missing-agent', 'agent-a']\n";
        Files.writeString(gatewayRoot.resolve("config.yaml"), configYaml);

        AgentConfigService freshService = new AgentConfigService(properties);
        freshService.loadRegistry();

        assertTrue(freshService.isResidentInstance("agent-a", "admin"));
        assertFalse(freshService.isResidentInstance("missing-agent", "admin"));
        assertEquals(1, freshService.getResidentInstances().size());
    }

    @Test
    public void testFindAgent_exists() {
        AgentRegistryEntry entry = service.findAgent("test-agent");
        assertNotNull(entry);
        assertEquals("Test Agent", entry.name());
    }

    @Test
    public void testFindAgent_notFound() {
        assertNull(service.findAgent("nonexistent"));
    }

    @Test
    public void testLoadAgentConfigYaml() throws IOException {
        Path configDir = gatewayRoot.resolve("agents").resolve("test-agent").resolve("config");
        Files.createDirectories(configDir);
        Files.writeString(configDir.resolve("config.yaml"),
                "GOOSE_PROVIDER: openai\nGOOSE_MODEL: gpt-4o\n");

        Map<String, Object> config = service.loadAgentConfigYaml("test-agent");
        assertEquals("openai", config.get("GOOSE_PROVIDER"));
        assertEquals("gpt-4o", config.get("GOOSE_MODEL"));
    }

    @Test
    public void testLoadAgentConfigYaml_noFile() {
        Map<String, Object> config = service.loadAgentConfigYaml("nonexistent");
        assertTrue(config.isEmpty());
    }

    @Test
    public void testReadWriteAgentsMd() throws IOException {
        Path agentDir = gatewayRoot.resolve("agents").resolve("test-agent");
        Files.createDirectories(agentDir);
        Files.writeString(agentDir.resolve("AGENTS.md"), "# Test Agent\n");

        String md = service.readAgentsMd("test-agent");
        assertEquals("# Test Agent\n", md);

        service.writeAgentsMd("test-agent", "# Updated\nNew content\n");
        String updated = service.readAgentsMd("test-agent");
        assertEquals("# Updated\nNew content\n", updated);
    }

    @Test
    public void testReadAgentsMd_noFile() {
        String md = service.readAgentsMd("nonexistent");
        assertEquals("", md);
    }

    @Test
    public void testListSkills() throws IOException {
        Path skillsDir = gatewayRoot.resolve("agents").resolve("test-agent")
                .resolve("config").resolve("skills");
        Files.createDirectories(skillsDir.resolve("skill-a"));
        Files.createDirectories(skillsDir.resolve("skill-b"));
        Files.writeString(skillsDir.resolve("readme.txt"), "not a skill");

        // Add SKILL.md with frontmatter to skill-a
        Files.writeString(skillsDir.resolve("skill-a").resolve("SKILL.md"),
                "---\nname: Skill A\ndescription: Description of skill A\n---\n# Skill A\n");

        List<Map<String, String>> skills = service.listSkills("test-agent");
        assertEquals(2, skills.size());

        List<String> names = skills.stream().map(s -> s.get("name")).toList();
        assertTrue(names.contains("Skill A"));  // parsed from frontmatter
        assertTrue(names.contains("skill-b"));  // fallback to dir name

        // Verify skill-a has parsed description
        Map<String, String> skillA = skills.stream()
                .filter(s -> "Skill A".equals(s.get("name"))).findFirst().orElseThrow();
        assertEquals("Description of skill A", skillA.get("description"));
        assertEquals("skills/skill-a", skillA.get("path"));

        // Verify skill-b has empty description (no SKILL.md)
        Map<String, String> skillB = skills.stream()
                .filter(s -> "skill-b".equals(s.get("name"))).findFirst().orElseThrow();
        assertEquals("", skillB.get("description"));
    }

    @Test
    public void testListSkills_noSkillsDir() {
        List<Map<String, String>> skills = service.listSkills("nonexistent");
        assertTrue(skills.isEmpty());
    }

    @Test
    public void testCreateAgent() throws IOException {
        Path templateDir = gatewayRoot.resolve("agents").resolve("universal-agent").resolve("config");
        Files.createDirectories(templateDir);
        Files.writeString(templateDir.resolve("config.yaml"),
                "GOOSE_PROVIDER: anthropic\nGOOSE_MODEL: claude-3\n");

        Map<String, Object> result = service.createAgent("new-agent", "New Agent");
        assertEquals("new-agent", result.get("id"));
        assertEquals("New Agent", result.get("name"));
        assertEquals("anthropic", result.get("provider"));

        assertNotNull(service.findAgent("new-agent"));

        assertTrue(Files.exists(gatewayRoot.resolve("agents").resolve("new-agent").resolve("AGENTS.md")));
        assertTrue(Files.exists(gatewayRoot.resolve("agents").resolve("new-agent").resolve("config").resolve("config.yaml")));
        assertTrue(Files.exists(gatewayRoot.resolve("agents").resolve("new-agent").resolve("config").resolve("secrets.yaml")));
    }

    @Test(expected = IllegalArgumentException.class)
    public void testCreateAgent_duplicateId() throws IOException {
        service.createAgent("test-agent", "Duplicate");
    }

    @Test(expected = IllegalArgumentException.class)
    public void testCreateAgent_invalidId() throws IOException {
        service.createAgent("INVALID!", "Bad ID");
    }

    @Test
    public void testDeleteAgent() throws IOException {
        Path agentDir = gatewayRoot.resolve("agents").resolve("test-agent");
        Files.createDirectories(agentDir.resolve("config"));
        Files.writeString(agentDir.resolve("AGENTS.md"), "# Test\n");

        service.deleteAgent("test-agent");

        assertNull(service.findAgent("test-agent"));
        assertFalse(Files.exists(agentDir));
    }

    @Test(expected = IllegalArgumentException.class)
    public void testDeleteAgent_notFound() throws IOException {
        service.deleteAgent("nonexistent");
    }

    @Test
    public void testLoadAgentSecretsYaml() throws IOException {
        Path configDir = gatewayRoot.resolve("agents").resolve("test-agent").resolve("config");
        Files.createDirectories(configDir);
        Files.writeString(configDir.resolve("secrets.yaml"),
                "OPENAI_API_KEY: sk-test123\nANTHROPIC_KEY: ak-test456\n");

        Map<String, Object> secrets = service.loadAgentSecretsYaml("test-agent");
        assertEquals("sk-test123", secrets.get("OPENAI_API_KEY"));
        assertEquals("ak-test456", secrets.get("ANTHROPIC_KEY"));
    }

    @Test
    public void testLoadAgentSecretsYaml_noFile() {
        Map<String, Object> secrets = service.loadAgentSecretsYaml("nonexistent");
        assertTrue(secrets.isEmpty());
    }

    @Test(expected = IllegalArgumentException.class)
    public void testCreateAgent_duplicateName() throws IOException {
        service.createAgent("another-agent", "Test Agent");
    }

    @Test
    public void testCreateAgent_noTemplate() throws IOException {
        Map<String, Object> result = service.createAgent("new-agent", "New Agent");
        assertEquals("new-agent", result.get("id"));
        assertEquals("New Agent", result.get("name"));
        assertEquals("openai", result.get("provider"));
    }

    @Test
    public void testGettersResolveCorrectPaths() {
        Path agentsDir = service.getAgentsDir();
        assertTrue(agentsDir.toString().endsWith("gateway/agents"));

        Path usersDir = service.getUsersDir();
        assertTrue(usersDir.toString().endsWith("gateway/users"));
    }

    @Test
    public void testGetAgentConfigDir() {
        Path configDir = service.getAgentConfigDir("test-agent");
        assertTrue(configDir.toString().endsWith("agents/test-agent/config"));
    }

    @Test
    public void testDeleteAgent_removesFromYaml() throws IOException {
        Path agentDir = gatewayRoot.resolve("agents").resolve("test-agent");
        Files.createDirectories(agentDir.resolve("config"));
        Files.writeString(agentDir.resolve("AGENTS.md"), "# Test\n");

        int sizeBefore = service.getRegistry().size();
        service.deleteAgent("test-agent");
        assertEquals(sizeBefore - 1, service.getRegistry().size());

        AgentConfigService freshService = new AgentConfigService(properties);
        freshService.loadRegistry();
        assertNull(freshService.findAgent("test-agent"));
    }

    @Test
    public void testRegistryIsUnmodifiable() {
        List<AgentRegistryEntry> registry = service.getRegistry();
        try {
            registry.add(new AgentRegistryEntry("illegal", "Illegal"));
        } catch (UnsupportedOperationException e) {
            // Expected
        }
    }

    @Test
    public void testCreateAgent_updatesAgentsYaml() throws IOException {
        Path templateDir = gatewayRoot.resolve("agents").resolve("universal-agent").resolve("config");
        Files.createDirectories(templateDir);
        Files.writeString(templateDir.resolve("config.yaml"),
                "GOOSE_PROVIDER: anthropic\nGOOSE_MODEL: claude-3\n");

        service.createAgent("created-agent", "Created Agent");

        AgentConfigService freshService = new AgentConfigService(properties);
        freshService.loadRegistry();
        assertNotNull(freshService.findAgent("created-agent"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void testCreateAgent_singleCharId() throws IOException {
        service.createAgent("a", "Single Char");
    }

    @Test
    public void testCreateAgent_skillsDirectoryCreated() throws IOException {
        service.createAgent("new-agent", "New Agent");
        Path skillsDir = gatewayRoot.resolve("agents").resolve("new-agent")
                .resolve("config").resolve("skills");
        assertTrue(Files.isDirectory(skillsDir));
    }

    @Test
    public void testLoadRegistry_emptyAgentsYaml() throws IOException {
        Files.writeString(gatewayRoot.resolve("config.yaml"), "");
        AgentConfigService freshService = new AgentConfigService(properties);
        freshService.loadRegistry();
        assertTrue(freshService.getRegistry().isEmpty());
    }

    @Test
    public void testLoadRegistry_noAgentsKey() throws IOException {
        Files.writeString(gatewayRoot.resolve("config.yaml"), "other: value\n");
        AgentConfigService freshService = new AgentConfigService(properties);
        freshService.loadRegistry();
        assertTrue(freshService.getRegistry().isEmpty());
    }

    @Test
    public void testLoadRegistry_enabledFalseExcludesAgent() throws IOException {
        String configYaml = "agents:\n"
                + "  - id: agent-a\n    name: Agent A\n"
                + "  - id: agent-b\n    name: Agent B\n    enabled: false\n"
                + "  - id: agent-c\n    name: Agent C\n";
        Files.writeString(gatewayRoot.resolve("config.yaml"), configYaml);

        AgentConfigService freshService = new AgentConfigService(properties);
        freshService.loadRegistry();

        List<AgentRegistryEntry> registry = freshService.getRegistry();
        assertEquals(2, registry.size());
        assertEquals("agent-a", registry.get(0).id());
        assertEquals("agent-c", registry.get(1).id());
        assertNull(freshService.findAgent("agent-b"));
    }

    @Test
    public void testLoadRegistry_enabledTrueIncludesAgent() throws IOException {
        String configYaml = "agents:\n"
                + "  - id: agent-a\n    name: Agent A\n    enabled: true\n";
        Files.writeString(gatewayRoot.resolve("config.yaml"), configYaml);

        AgentConfigService freshService = new AgentConfigService(properties);
        freshService.loadRegistry();

        assertEquals(1, freshService.getRegistry().size());
        assertNotNull(freshService.findAgent("agent-a"));
    }

    @Test
    public void testLoadRegistry_enabledOmittedDefaultsToTrue() throws IOException {
        String configYaml = "agents:\n"
                + "  - id: agent-no-enabled\n    name: No Enabled Field\n";
        Files.writeString(gatewayRoot.resolve("config.yaml"), configYaml);

        AgentConfigService freshService = new AgentConfigService(properties);
        freshService.loadRegistry();

        assertEquals(1, freshService.getRegistry().size());
        assertNotNull(freshService.findAgent("agent-no-enabled"));
    }

    @Test
    public void testLoadRegistry_allDisabledResultsInEmptyRegistry() throws IOException {
        String configYaml = "agents:\n"
                + "  - id: agent-x\n    name: Agent X\n    enabled: false\n"
                + "  - id: agent-y\n    name: Agent Y\n    enabled: false\n";
        Files.writeString(gatewayRoot.resolve("config.yaml"), configYaml);

        AgentConfigService freshService = new AgentConfigService(properties);
        freshService.loadRegistry();

        assertTrue(freshService.getRegistry().isEmpty());
    }

    // ── Memory file tests ──────────────────────────────────────────

    @Test
    public void testListMemoryFiles_empty() {
        List<Map<String, String>> files = service.listMemoryFiles("test-agent");
        assertTrue(files.isEmpty());
    }

    @Test
    public void testListMemoryFiles_withFiles() throws IOException {
        Path memoryDir = gatewayRoot.resolve("agents").resolve("test-agent")
                .resolve("config").resolve("goose").resolve("memory");
        Files.createDirectories(memoryDir);
        Files.writeString(memoryDir.resolve("development.txt"), "# tools\nuse black for formatting");
        Files.writeString(memoryDir.resolve("personal.txt"), "prefer Chinese replies");

        List<Map<String, String>> files = service.listMemoryFiles("test-agent");
        assertEquals(2, files.size());

        List<String> categories = files.stream().map(f -> f.get("category")).toList();
        assertTrue(categories.contains("development"));
        assertTrue(categories.contains("personal"));

        Map<String, String> dev = files.stream()
                .filter(f -> "development".equals(f.get("category"))).findFirst().orElseThrow();
        assertEquals("# tools\nuse black for formatting", dev.get("content"));
    }

    @Test
    public void testListMemoryFiles_ignoresNonTxt() throws IOException {
        Path memoryDir = gatewayRoot.resolve("agents").resolve("test-agent")
                .resolve("config").resolve("goose").resolve("memory");
        Files.createDirectories(memoryDir);
        Files.writeString(memoryDir.resolve("valid.txt"), "content");
        Files.writeString(memoryDir.resolve("ignored.md"), "markdown");

        List<Map<String, String>> files = service.listMemoryFiles("test-agent");
        assertEquals(1, files.size());
        assertEquals("valid", files.get(0).get("category"));
    }

    @Test
    public void testReadMemoryFile_exists() throws IOException {
        Path memoryDir = gatewayRoot.resolve("agents").resolve("test-agent")
                .resolve("config").resolve("goose").resolve("memory");
        Files.createDirectories(memoryDir);
        Files.writeString(memoryDir.resolve("dev.txt"), "hello world");

        String content = service.readMemoryFile("test-agent", "dev");
        assertEquals("hello world", content);
    }

    @Test
    public void testReadMemoryFile_notFound() {
        String content = service.readMemoryFile("test-agent", "nonexistent");
        assertNull(content);
    }

    @Test
    public void testWriteMemoryFile_createsDirectoryAndFile() throws IOException {
        service.writeMemoryFile("test-agent", "new-category", "some content");

        Path file = gatewayRoot.resolve("agents").resolve("test-agent")
                .resolve("config").resolve("goose").resolve("memory").resolve("new-category.txt");
        assertTrue(Files.exists(file));
        assertEquals("some content", Files.readString(file));
    }

    @Test
    public void testWriteMemoryFile_updatesExisting() throws IOException {
        service.writeMemoryFile("test-agent", "cat", "v1");
        service.writeMemoryFile("test-agent", "cat", "v2");

        assertEquals("v2", service.readMemoryFile("test-agent", "cat"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void testWriteMemoryFile_tooLarge() throws IOException {
        String largeContent = "x".repeat(101 * 1024);
        service.writeMemoryFile("test-agent", "big", largeContent);
    }

    @Test
    public void testDeleteMemoryFile_success() throws IOException {
        Path memoryDir = gatewayRoot.resolve("agents").resolve("test-agent")
                .resolve("config").resolve("goose").resolve("memory");
        Files.createDirectories(memoryDir);
        Files.writeString(memoryDir.resolve("toDelete.txt"), "bye");

        service.deleteMemoryFile("test-agent", "toDelete");
        assertFalse(Files.exists(memoryDir.resolve("toDelete.txt")));
    }

    @Test(expected = IllegalArgumentException.class)
    public void testDeleteMemoryFile_notFound() throws IOException {
        service.deleteMemoryFile("test-agent", "nonexistent");
    }

    @Test
    public void testWriteAndReadRoundTrip() throws IOException {
        String content = "# formatting tools\nuse black\n\n# deployment\nuse k8s";
        service.writeMemoryFile("test-agent", "dev", content);
        assertEquals(content, service.readMemoryFile("test-agent", "dev"));
    }

    @Test
    public void testListMemoryFiles_afterWriteAndDelete() throws IOException {
        service.writeMemoryFile("test-agent", "a", "content-a");
        service.writeMemoryFile("test-agent", "b", "content-b");
        assertEquals(2, service.listMemoryFiles("test-agent").size());

        service.deleteMemoryFile("test-agent", "a");
        List<Map<String, String>> remaining = service.listMemoryFiles("test-agent");
        assertEquals(1, remaining.size());
        assertEquals("b", remaining.get(0).get("category"));
    }

    @Test
    public void testLoadRegistry_disabledAgentIsExcludedFromResidentExpansion() throws IOException {
        String configYaml = "agents:\n"
                + "  - id: visible-agent\n    name: Visible Agent\n"
                + "  - id: hidden-agent\n    name: Hidden Agent\n    enabled: false\n"
                + "residentInstances:\n"
                + "  enabled: true\n"
                + "  entries:\n"
                + "    - userId: admin\n"
                + "      agentIds: ['*']\n";
        Files.writeString(gatewayRoot.resolve("config.yaml"), configYaml);

        AgentConfigService freshService = new AgentConfigService(properties);
        freshService.loadRegistry();

        assertEquals(1, freshService.getRegistry().size());
        assertNotNull(freshService.findAgent("visible-agent"));
        assertNull(freshService.findAgent("hidden-agent"));
        assertTrue(freshService.isResidentInstance("visible-agent", "admin"));
        assertFalse(freshService.isResidentInstance("hidden-agent", "admin"));
    }
}
