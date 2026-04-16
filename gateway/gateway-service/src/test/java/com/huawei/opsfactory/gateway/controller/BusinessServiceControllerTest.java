package com.huawei.opsfactory.gateway.controller;

import com.huawei.opsfactory.gateway.config.GatewayProperties;
import com.huawei.opsfactory.gateway.filter.AuthWebFilter;
import com.huawei.opsfactory.gateway.filter.UserContextFilter;
import com.huawei.opsfactory.gateway.service.BusinessServiceService;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.WebFluxTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.reactive.server.WebTestClient;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;

@RunWith(SpringRunner.class)
@WebFluxTest(BusinessServiceController.class)
@Import({GatewayProperties.class, AuthWebFilter.class, UserContextFilter.class})
public class BusinessServiceControllerTest {

    @Autowired
    private WebTestClient webTestClient;

    @MockBean
    private BusinessServiceService businessServiceService;

    @MockBean
    private com.huawei.opsfactory.gateway.process.PrewarmService prewarmService;

    // ── listBusinessServices ───────────────────────────────────────

    @Test
    public void testListBusinessServices() {
        when(businessServiceService.listBusinessServices(isNull(), isNull()))
                .thenReturn(List.of());

        webTestClient.get().uri("/gateway/business-services")
                .header("x-secret-key", "test")
                .header("x-user-id", "admin")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.businessServices").isArray()
                .jsonPath("$.businessServices").isEmpty();
    }

    @Test
    public void testListBusinessServices_withKeyword() {
        Map<String, Object> bs = new LinkedHashMap<>();
        bs.put("id", "bs-1");
        bs.put("name", "OrderService");
        when(businessServiceService.searchByKeyword("order")).thenReturn(List.of(bs));

        webTestClient.get().uri("/gateway/business-services?keyword=order")
                .header("x-secret-key", "test")
                .header("x-user-id", "admin")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.businessServices[0].id").isEqualTo("bs-1");
    }

    // ── getBusinessService ─────────────────────────────────────────

    @Test
    public void testGetBusinessService() {
        Map<String, Object> bs = new LinkedHashMap<>();
        bs.put("id", "bs-1");
        bs.put("name", "OrderService");
        when(businessServiceService.getBusinessService("bs-1")).thenReturn(bs);

        webTestClient.get().uri("/gateway/business-services/bs-1")
                .header("x-secret-key", "test")
                .header("x-user-id", "admin")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.success").isEqualTo(true)
                .jsonPath("$.businessService.id").isEqualTo("bs-1");
    }

    @Test
    public void testGetBusinessService_notFound() {
        when(businessServiceService.getBusinessService("nonexistent"))
                .thenThrow(new IllegalArgumentException("Business service not found: nonexistent"));

        webTestClient.get().uri("/gateway/business-services/nonexistent")
                .header("x-secret-key", "test")
                .header("x-user-id", "admin")
                .exchange()
                .expectStatus().isNotFound()
                .expectBody()
                .jsonPath("$.success").isEqualTo(false);
    }

    // ── getResolved ────────────────────────────────────────────────

    @Test
    public void testGetBusinessServiceResolved() {
        Map<String, Object> resolved = new LinkedHashMap<>();
        resolved.put("id", "bs-1");
        resolved.put("name", "OrderService");
        resolved.put("resolvedHosts", List.of());
        resolved.put("totalHostCount", 0);
        when(businessServiceService.getWithResolvedHosts("bs-1")).thenReturn(resolved);

        webTestClient.get().uri("/gateway/business-services/bs-1/resolved")
                .header("x-secret-key", "test")
                .header("x-user-id", "admin")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.success").isEqualTo(true)
                .jsonPath("$.businessService.id").isEqualTo("bs-1");
    }

    // ── getHosts ───────────────────────────────────────────────────

    @Test
    public void testGetBusinessServiceHosts() {
        Map<String, Object> host = new LinkedHashMap<>();
        host.put("id", "host-1");
        host.put("name", "Server1");
        when(businessServiceService.getHostsForBusinessService("bs-1"))
                .thenReturn(List.of(host));

        webTestClient.get().uri("/gateway/business-services/bs-1/hosts")
                .header("x-secret-key", "test")
                .header("x-user-id", "admin")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.hosts[0].id").isEqualTo("host-1");
    }

    // ── getTopology ────────────────────────────────────────────────

    @Test
    public void testGetBusinessServiceTopology() {
        Map<String, Object> topology = new LinkedHashMap<>();
        topology.put("nodes", List.of());
        topology.put("edges", List.of());
        when(businessServiceService.getTopologyForBusinessService("bs-1")).thenReturn(topology);

        webTestClient.get().uri("/gateway/business-services/bs-1/topology")
                .header("x-secret-key", "test")
                .header("x-user-id", "admin")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.nodes").isArray()
                .jsonPath("$.edges").isArray();
    }

    // ── createBusinessService ──────────────────────────────────────

    @Test
    public void testCreateBusinessService() {
        Map<String, Object> created = new LinkedHashMap<>();
        created.put("id", "new-id");
        created.put("name", "NewService");
        when(businessServiceService.createBusinessService(any())).thenReturn(created);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", "NewService");

        webTestClient.post().uri("/gateway/business-services")
                .header("x-secret-key", "test")
                .header("x-user-id", "admin")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .exchange()
                .expectStatus().isCreated()
                .expectBody()
                .jsonPath("$.success").isEqualTo(true)
                .jsonPath("$.businessService.id").isEqualTo("new-id");
    }

    @Test
    public void testCreateBusinessService_error() {
        when(businessServiceService.createBusinessService(any()))
                .thenThrow(new RuntimeException("Creation failed"));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", "FailService");

        webTestClient.post().uri("/gateway/business-services")
                .header("x-secret-key", "test")
                .header("x-user-id", "admin")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .exchange()
                .expectStatus().isBadRequest()
                .expectBody()
                .jsonPath("$.success").isEqualTo(false);
    }

    // ── updateBusinessService ──────────────────────────────────────

    @Test
    public void testUpdateBusinessService() {
        Map<String, Object> updated = new LinkedHashMap<>();
        updated.put("id", "bs-1");
        updated.put("name", "UpdatedService");
        when(businessServiceService.updateBusinessService(eq("bs-1"), any())).thenReturn(updated);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", "UpdatedService");

        webTestClient.put().uri("/gateway/business-services/bs-1")
                .header("x-secret-key", "test")
                .header("x-user-id", "admin")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.success").isEqualTo(true)
                .jsonPath("$.businessService.name").isEqualTo("UpdatedService");
    }

    @Test
    public void testUpdateBusinessService_notFound() {
        when(businessServiceService.updateBusinessService(eq("nonexistent"), any()))
                .thenThrow(new IllegalArgumentException("Business service not found: nonexistent"));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", "Updated");

        webTestClient.put().uri("/gateway/business-services/nonexistent")
                .header("x-secret-key", "test")
                .header("x-user-id", "admin")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .exchange()
                .expectStatus().isNotFound()
                .expectBody()
                .jsonPath("$.success").isEqualTo(false);
    }

    // ── deleteBusinessService ──────────────────────────────────────

    @Test
    public void testDeleteBusinessService() {
        when(businessServiceService.deleteBusinessService("bs-1")).thenReturn(true);

        webTestClient.delete().uri("/gateway/business-services/bs-1")
                .header("x-secret-key", "test")
                .header("x-user-id", "admin")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.success").isEqualTo(true);
    }

    @Test
    public void testDeleteBusinessService_notFound() {
        when(businessServiceService.deleteBusinessService("nonexistent")).thenReturn(false);

        webTestClient.delete().uri("/gateway/business-services/nonexistent")
                .header("x-secret-key", "test")
                .header("x-user-id", "admin")
                .exchange()
                .expectStatus().isNotFound()
                .expectBody()
                .jsonPath("$.success").isEqualTo(false);
    }

    // ── migrate ────────────────────────────────────────────────────

    @Test
    public void testMigrate() {
        Map<String, Object> migrateResult = new LinkedHashMap<>();
        migrateResult.put("migrated", 2);
        migrateResult.put("businessServices", List.of());
        when(businessServiceService.migrateFromBusinessField()).thenReturn(migrateResult);

        webTestClient.post().uri("/gateway/business-services/migrate")
                .header("x-secret-key", "test")
                .header("x-user-id", "admin")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.migrated").isEqualTo(2);
    }

    // ── Auth tests ─────────────────────────────────────────────────

    @Test
    public void testListBusinessServices_unauthorized_noKey() {
        webTestClient.get().uri("/gateway/business-services")
                .header("x-user-id", "admin")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    public void testListBusinessServices_forbidden_nonAdmin() {
        webTestClient.get().uri("/gateway/business-services")
                .header("x-secret-key", "test")
                .header("x-user-id", "regular-user")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    public void testCreateBusinessService_forbidden_nonAdmin() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", "Service");

        webTestClient.post().uri("/gateway/business-services")
                .header("x-secret-key", "test")
                .header("x-user-id", "regular-user")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(body)
                .exchange()
                .expectStatus().isForbidden();
    }
}
