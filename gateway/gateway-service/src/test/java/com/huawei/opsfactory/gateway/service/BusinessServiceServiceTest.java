package com.huawei.opsfactory.gateway.service;

import com.huawei.opsfactory.gateway.config.GatewayProperties;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

import static org.junit.Assert.*;

public class BusinessServiceServiceTest {

    @Rule
    public TemporaryFolder tempFolder = new TemporaryFolder();

    private BusinessServiceService businessServiceService;
    private GatewayProperties properties;
    private Path businessServicesDir;

    @Before
    public void setUp() throws IOException {
        properties = new GatewayProperties();
        GatewayProperties.Paths paths = new GatewayProperties.Paths();
        paths.setProjectRoot(tempFolder.getRoot().getAbsolutePath());
        properties.setPaths(paths);

        businessServiceService = new BusinessServiceService(properties);
        businessServiceService.init();

        businessServicesDir = Path.of(tempFolder.getRoot().getAbsolutePath())
                .toAbsolutePath().normalize().resolve("gateway").resolve("data").resolve("business-services");
    }

    // ── createBusinessService ──────────────────────────────────────

    @Test
    public void testCreateBusinessService() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", "OrderService");
        body.put("code", "ORDER");
        body.put("groupId", "group-1");
        body.put("description", "Order management service");
        body.put("hostIds", List.of("cluster-1", "cluster-2"));
        body.put("tags", List.of("core", "production"));
        body.put("priority", "high");
        body.put("contactInfo", "team-order@example.com");

        Map<String, Object> result = businessServiceService.createBusinessService(body);

        assertNotNull(result.get("id"));
        assertEquals("OrderService", result.get("name"));
        assertEquals("ORDER", result.get("code"));
        assertEquals("group-1", result.get("groupId"));
        assertEquals("Order management service", result.get("description"));
        assertEquals(List.of("cluster-1", "cluster-2"), result.get("hostIds"));
        assertEquals(List.of("core", "production"), result.get("tags"));
        assertEquals("high", result.get("priority"));
        assertEquals("team-order@example.com", result.get("contactInfo"));
        assertNotNull(result.get("createdAt"));
        assertNotNull(result.get("updatedAt"));
    }

    @Test
    public void testCreateBusinessService_defaults() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", "MinimalService");

        Map<String, Object> result = businessServiceService.createBusinessService(body);

        assertNotNull(result.get("id"));
        assertEquals("MinimalService", result.get("name"));
        assertEquals("", result.get("code"));
        assertNull(result.get("groupId"));
        assertEquals("", result.get("description"));
        assertEquals(Collections.emptyList(), result.get("hostIds"));
        assertEquals(Collections.emptyList(), result.get("tags"));
        assertEquals("", result.get("priority"));
        assertEquals("", result.get("contactInfo"));
    }

    // ── getBusinessService ─────────────────────────────────────────

    @Test
    public void testGetBusinessService() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", "GetTest");
        body.put("code", "GT");

        Map<String, Object> created = businessServiceService.createBusinessService(body);
        String id = (String) created.get("id");

        Map<String, Object> result = businessServiceService.getBusinessService(id);
        assertEquals("GetTest", result.get("name"));
        assertEquals("GT", result.get("code"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void testGetBusinessService_notFound() {
        businessServiceService.getBusinessService("nonexistent");
    }

    // ── listBusinessServices ───────────────────────────────────────

    @Test
    public void testListBusinessServices_empty() {
        List<Map<String, Object>> services = businessServiceService.listBusinessServices(null, null);
        assertTrue(services.isEmpty());
    }

    @Test
    public void testListBusinessServices_returnsAll() {
        createBs("bs-1", "Svc1", "S1", "group-1", List.of());
        createBs("bs-2", "Svc2", "S2", "group-1", List.of());
        createBs("bs-3", "Svc3", "S3", "group-2", List.of());

        List<Map<String, Object>> services = businessServiceService.listBusinessServices(null, null);
        assertEquals(3, services.size());
    }

    @Test
    public void testListBusinessServices_filterByGroupId() {
        createBs("bs-1", "Svc1", "S1", "group-1", List.of());
        createBs("bs-2", "Svc2", "S2", "group-2", List.of());

        List<Map<String, Object>> services = businessServiceService.listBusinessServices("group-1", null);
        assertEquals(1, services.size());
        assertEquals("Svc1", services.get(0).get("name"));
    }

    @Test
    public void testListBusinessServices_filterByHostId() {
        createBs("bs-1", "Svc1", "S1", "group-1", List.of("host-1", "host-2"));
        createBs("bs-2", "Svc2", "S2", "group-1", List.of("host-3"));

        List<Map<String, Object>> services = businessServiceService.listBusinessServices(null, "host-2");
        assertEquals(1, services.size());
        assertEquals("Svc1", services.get(0).get("name"));
    }

    // ── updateBusinessService ──────────────────────────────────────

    @Test
    public void testUpdateBusinessService() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", "Original");
        body.put("code", "ORIG");
        body.put("tags", List.of("v1"));

        Map<String, Object> created = businessServiceService.createBusinessService(body);
        String id = (String) created.get("id");

        Map<String, Object> updates = new LinkedHashMap<>();
        updates.put("name", "Updated");
        updates.put("code", "UPD");
        updates.put("tags", List.of("v2"));

        Map<String, Object> result = businessServiceService.updateBusinessService(id, updates);
        assertEquals("Updated", result.get("name"));
        assertEquals("UPD", result.get("code"));
        assertEquals(List.of("v2"), result.get("tags"));
    }

    @Test
    public void testUpdateBusinessService_partialUpdate() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", "Original");
        body.put("code", "ORIG");
        body.put("description", "original desc");

        Map<String, Object> created = businessServiceService.createBusinessService(body);
        String id = (String) created.get("id");

        Map<String, Object> updates = new LinkedHashMap<>();
        updates.put("description", "new desc");

        Map<String, Object> result = businessServiceService.updateBusinessService(id, updates);
        assertEquals("Original", result.get("name"));
        assertEquals("ORIG", result.get("code"));
        assertEquals("new desc", result.get("description"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void testUpdateBusinessService_notFound() {
        Map<String, Object> updates = new LinkedHashMap<>();
        updates.put("name", "NewName");
        businessServiceService.updateBusinessService("nonexistent", updates);
    }

    // ── deleteBusinessService ──────────────────────────────────────

    @Test
    public void testDeleteBusinessService() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", "ToDelete");
        Map<String, Object> created = businessServiceService.createBusinessService(body);
        String id = (String) created.get("id");

        assertTrue(businessServiceService.deleteBusinessService(id));
        assertFalse(Files.exists(businessServicesDir.resolve(id + ".json")));
    }

    @Test
    public void testDeleteBusinessService_notFound() {
        assertFalse(businessServiceService.deleteBusinessService("nonexistent"));
    }

    // ── searchByKeyword ────────────────────────────────────────────

    @Test
    public void testSearchByKeyword() {
        createBs("bs-1", "OrderService", "ORDER", null, List.of(), List.of("core"));
        createBs("bs-2", "PaymentService", "PAY", null, List.of(), List.of("billing"));
        createBs("bs-3", "ShippingService", "SHIP", null, List.of(), List.of("order"));

        List<Map<String, Object>> byName = businessServiceService.searchByKeyword("order");
        assertEquals(2, byName.size()); // OrderService (name) + ShippingService (tag "order")

        List<Map<String, Object>> byCode = businessServiceService.searchByKeyword("pay");
        assertEquals(1, byCode.size());
        assertEquals("PaymentService", byCode.get(0).get("name"));

        List<Map<String, Object>> byTag = businessServiceService.searchByKeyword("billing");
        assertEquals(1, byTag.size());
    }

    @Test
    public void testSearchByKeyword_emptyKeyword() {
        createBs("bs-1", "Svc1", "S1", null, List.of());

        List<Map<String, Object>> all = businessServiceService.searchByKeyword("");
        assertEquals(1, all.size());

        List<Map<String, Object>> nullKw = businessServiceService.searchByKeyword(null);
        assertEquals(1, nullKw.size());
    }

    // ── Helpers ────────────────────────────────────────────────────

    private void createBs(String id, String name, String code, String groupId, List<String> hostIds) {
        createBs(id, name, code, groupId, hostIds, List.of());
    }

    private void createBs(String id, String name, String code, String groupId, List<String> hostIds, List<String> tags) {
        Map<String, Object> bs = new LinkedHashMap<>();
        bs.put("id", id);
        bs.put("name", name);
        bs.put("code", code);
        bs.put("groupId", groupId);
        bs.put("description", "");
        bs.put("hostIds", hostIds);
        bs.put("tags", tags);
        bs.put("priority", "");
        bs.put("contactInfo", "");
        bs.put("createdAt", "2026-01-01T00:00:00Z");
        bs.put("updatedAt", "2026-01-01T00:00:00Z");

        try {
            Path file = businessServicesDir.resolve(id + ".json");
            String json = new com.fasterxml.jackson.databind.ObjectMapper()
                    .writerWithDefaultPrettyPrinter().writeValueAsString(bs);
            Files.writeString(file, json, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
}
