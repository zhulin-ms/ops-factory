package com.huawei.opsfactory.gateway.controller;

import com.huawei.opsfactory.gateway.common.model.ManagedInstance;
import com.huawei.opsfactory.gateway.config.GatewayProperties;
import com.huawei.opsfactory.gateway.filter.AuthWebFilter;
import com.huawei.opsfactory.gateway.filter.UserContextFilter;
import com.huawei.opsfactory.gateway.monitoring.MetricsBuffer;
import com.huawei.opsfactory.gateway.monitoring.MetricsSnapshot;
import com.huawei.opsfactory.gateway.process.InstanceManager;
import com.huawei.opsfactory.gateway.process.PrewarmService;
import com.huawei.opsfactory.gateway.service.AgentConfigService;
import com.huawei.opsfactory.gateway.service.LangfuseService;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.WebFluxTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.reactive.server.WebTestClient;

import java.util.List;
import java.util.Map;

import static org.mockito.Mockito.when;

@RunWith(SpringRunner.class)
@WebFluxTest(InternalRuntimeSourceController.class)
@Import({GatewayProperties.class, AuthWebFilter.class, UserContextFilter.class})
public class InternalRuntimeSourceControllerTest {

    @Autowired
    private WebTestClient webTestClient;

    @MockBean
    private PrewarmService prewarmService;

    @MockBean
    private InstanceManager instanceManager;

    @MockBean
    private AgentConfigService agentConfigService;

    @MockBean
    private LangfuseService langfuseService;

    @MockBean
    private MetricsBuffer metricsBuffer;

    @Test
    public void testSystem_asAdmin() {
        when(agentConfigService.getRegistry()).thenReturn(List.of());
        when(instanceManager.getAllInstances()).thenReturn(List.of());
        when(langfuseService.isConfigured()).thenReturn(false);

        webTestClient.get().uri("/gateway/runtime-source/system")
                .header("x-secret-key", "test")
                .header("x-user-id", "admin")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.gateway.uptimeMs").isNumber()
                .jsonPath("$.gateway.host").isNotEmpty()
                .jsonPath("$.gateway.port").isNumber()
                .jsonPath("$.agents.configured").isEqualTo(0)
                .jsonPath("$.idle.timeoutMs").isNumber()
                .jsonPath("$.langfuse.configured").isEqualTo(false);
    }

    @Test
    public void testSystem_nonAdminForbidden() {
        webTestClient.get().uri("/gateway/runtime-source/system")
                .header("x-secret-key", "test")
                .header("x-user-id", "regular-user")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    public void testInstances() {
        ManagedInstance inst = new ManagedInstance("agent1", "user1", 9090, 5678L, null, "test-secret");
        inst.setStatus(ManagedInstance.Status.RUNNING);
        when(instanceManager.getAllInstances()).thenReturn(List.of(inst));
        when(agentConfigService.findAgent("agent1")).thenReturn(
                new com.huawei.opsfactory.gateway.common.model.AgentRegistryEntry("agent1", "Agent One"));

        webTestClient.get().uri("/gateway/runtime-source/instances")
                .header("x-secret-key", "test")
                .header("x-user-id", "admin")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.totalInstances").isEqualTo(1)
                .jsonPath("$.runningInstances").isEqualTo(1)
                .jsonPath("$.byAgent[0].agentId").isEqualTo("agent1")
                .jsonPath("$.byAgent[0].agentName").isEqualTo("Agent One")
                .jsonPath("$.byAgent[0].instances[0].userId").isEqualTo("user1")
                .jsonPath("$.byAgent[0].instances[0].port").isEqualTo(9090)
                .jsonPath("$.byAgent[0].instances[0].status").isEqualTo("running")
                .jsonPath("$.byAgent[0].instances[0].idleSinceMs").isNumber();
    }

    @Test
    public void testInstances_nonAdminForbidden() {
        webTestClient.get().uri("/gateway/runtime-source/instances")
                .header("x-secret-key", "test")
                .header("x-user-id", "regular-user")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    public void testMetrics_empty() {
        when(metricsBuffer.getSnapshots(120)).thenReturn(List.of());

        webTestClient.get().uri("/gateway/runtime-source/metrics")
                .header("x-secret-key", "test")
                .header("x-user-id", "admin")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.collectionIntervalSec").isEqualTo(30)
                .jsonPath("$.maxSlots").isEqualTo(120)
                .jsonPath("$.returnedSlots").isEqualTo(0)
                .jsonPath("$.current").isEmpty()
                .jsonPath("$.aggregate.totalRequests").isEqualTo(0)
                .jsonPath("$.aggregate.totalErrors").isEqualTo(0)
                .jsonPath("$.series.length()").isEqualTo(0);
    }

    @Test
    public void testMetrics_withSnapshots() {
        MetricsSnapshot s1 = new MetricsSnapshot();
        s1.setTimestamp(1000L);
        s1.setActiveInstances(2);
        s1.setTotalTokens(5000);
        s1.setTotalSessions(3);
        s1.setRequestCount(4);
        s1.setAvgLatencyMs(2000.0);
        s1.setAvgTtftMs(500.0);
        s1.setP95LatencyMs(3000.0);
        s1.setP95TtftMs(800.0);
        s1.setTotalBytes(10000);
        s1.setErrorCount(1);

        MetricsSnapshot s2 = new MetricsSnapshot();
        s2.setTimestamp(2000L);
        s2.setActiveInstances(3);
        s2.setTotalTokens(8000);
        s2.setTotalSessions(5);
        s2.setRequestCount(6);
        s2.setAvgLatencyMs(3000.0);
        s2.setAvgTtftMs(700.0);
        s2.setP95LatencyMs(5000.0);
        s2.setP95TtftMs(1200.0);
        s2.setTotalBytes(20000);
        s2.setErrorCount(0);

        when(metricsBuffer.getSnapshots(120)).thenReturn(List.of(s1, s2));
        when(metricsBuffer.getAgentStats()).thenReturn(Map.of());

        webTestClient.get().uri("/gateway/runtime-source/metrics")
                .header("x-secret-key", "test")
                .header("x-user-id", "admin")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.returnedSlots").isEqualTo(2)
                .jsonPath("$.current.activeInstances").isEqualTo(3)
                .jsonPath("$.current.totalTokens").isEqualTo(8000)
                .jsonPath("$.current.totalSessions").isEqualTo(5)
                .jsonPath("$.aggregate.totalRequests").isEqualTo(10)
                .jsonPath("$.aggregate.totalErrors").isEqualTo(1)
                .jsonPath("$.aggregate.avgLatencyMs").isEqualTo(2600.0)
                .jsonPath("$.series.length()").isEqualTo(2)
                .jsonPath("$.series[0].t").isEqualTo(1000)
                .jsonPath("$.series[1].t").isEqualTo(2000);
    }

    @Test
    public void testMetrics_nonAdminForbidden() {
        webTestClient.get().uri("/gateway/runtime-source/metrics")
                .header("x-secret-key", "test")
                .header("x-user-id", "regular-user")
                .exchange()
                .expectStatus().isForbidden();
    }
}
