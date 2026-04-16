package com.huawei.opsfactory.gateway.e2e;

import com.huawei.opsfactory.gateway.common.model.AgentRegistryEntry;
import com.huawei.opsfactory.gateway.common.model.ManagedInstance;
import com.huawei.opsfactory.gateway.monitoring.MetricsSnapshot;
import org.junit.Test;

import java.util.Collections;
import java.util.List;

import static org.mockito.Mockito.when;

/**
 * E2E tests for InternalRuntimeSourceController endpoints:
 * GET /runtime-source/system
 * GET /runtime-source/instances
 * GET /runtime-source/metrics
 */
public class RuntimeSourceEndpointE2ETest extends BaseE2ETest {

    @Test
    public void system_admin_returnsSystemInfo() {
        when(agentConfigService.getRegistry()).thenReturn(List.of(
                new AgentRegistryEntry("agent-a", "Agent A")));
        when(instanceManager.getAllInstances()).thenReturn(Collections.emptyList());
        when(langfuseService.isConfigured()).thenReturn(false);

        webClient.get().uri("/gateway/runtime-source/system")
                .header(HEADER_SECRET_KEY, SECRET_KEY)
                .header(HEADER_USER_ID, "admin")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.gateway.uptimeMs").isNumber()
                .jsonPath("$.gateway.host").isNotEmpty()
                .jsonPath("$.gateway.port").isNumber()
                .jsonPath("$.agents.configured").isEqualTo(1)
                .jsonPath("$.idle.timeoutMs").isNumber()
                .jsonPath("$.langfuse.configured").isEqualTo(false);
    }

    @Test
    public void system_nonAdmin_returns403() {
        webClient.get().uri("/gateway/runtime-source/system")
                .header(HEADER_SECRET_KEY, SECRET_KEY)
                .header(HEADER_USER_ID, "alice")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    public void system_unauthenticated_returns401() {
        webClient.get().uri("/gateway/runtime-source/system")
                .exchange()
                .expectStatus().isUnauthorized();
    }

    @Test
    public void instances_admin_returnsInstanceList() {
        ManagedInstance inst = new ManagedInstance("agent-a", "alice", 9001, 54321L, null, "test-secret");
        inst.setStatus(ManagedInstance.Status.RUNNING);
        when(instanceManager.getAllInstances()).thenReturn(List.of(inst));
        when(agentConfigService.findAgent("agent-a")).thenReturn(
                new AgentRegistryEntry("agent-a", "Agent A"));

        webClient.get().uri("/gateway/runtime-source/instances")
                .header(HEADER_SECRET_KEY, SECRET_KEY)
                .header(HEADER_USER_ID, "admin")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.totalInstances").isEqualTo(1)
                .jsonPath("$.runningInstances").isEqualTo(1)
                .jsonPath("$.byAgent.length()").isEqualTo(1)
                .jsonPath("$.byAgent[0].agentId").isEqualTo("agent-a")
                .jsonPath("$.byAgent[0].agentName").isEqualTo("Agent A")
                .jsonPath("$.byAgent[0].instances[0].userId").isEqualTo("alice")
                .jsonPath("$.byAgent[0].instances[0].port").isEqualTo(9001)
                .jsonPath("$.byAgent[0].instances[0].pid").isEqualTo(54321)
                .jsonPath("$.byAgent[0].instances[0].status").isEqualTo("running")
                .jsonPath("$.byAgent[0].instances[0].lastActivity").isNumber()
                .jsonPath("$.byAgent[0].instances[0].idleSinceMs").isNumber();
    }

    @Test
    public void instances_nonAdmin_returns403() {
        webClient.get().uri("/gateway/runtime-source/instances")
                .header(HEADER_SECRET_KEY, SECRET_KEY)
                .header(HEADER_USER_ID, "bob")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    public void metrics_admin_returnsMetricsData() {
        MetricsSnapshot s = new MetricsSnapshot();
        s.setTimestamp(1000L);
        s.setActiveInstances(2);
        s.setTotalTokens(5000);
        s.setTotalSessions(3);
        s.setRequestCount(4);
        s.setAvgLatencyMs(2500.0);
        s.setAvgTtftMs(800.0);
        s.setP95LatencyMs(4000.0);
        s.setP95TtftMs(1500.0);
        s.setTotalBytes(15000);
        s.setErrorCount(1);

        when(metricsBuffer.getSnapshots(120)).thenReturn(List.of(s));
        when(metricsBuffer.getAgentStats()).thenReturn(Collections.emptyMap());

        webClient.get().uri("/gateway/runtime-source/metrics")
                .header(HEADER_SECRET_KEY, SECRET_KEY)
                .header(HEADER_USER_ID, "admin")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.collectionIntervalSec").isEqualTo(30)
                .jsonPath("$.maxSlots").isEqualTo(120)
                .jsonPath("$.returnedSlots").isEqualTo(1)
                .jsonPath("$.current.activeInstances").isEqualTo(2)
                .jsonPath("$.current.totalTokens").isEqualTo(5000)
                .jsonPath("$.current.totalSessions").isEqualTo(3)
                .jsonPath("$.aggregate.totalRequests").isEqualTo(4)
                .jsonPath("$.aggregate.totalErrors").isEqualTo(1)
                .jsonPath("$.aggregate.avgLatencyMs").isEqualTo(2500.0)
                .jsonPath("$.aggregate.avgTtftMs").isEqualTo(800.0)
                .jsonPath("$.series.length()").isEqualTo(1)
                .jsonPath("$.series[0].t").isEqualTo(1000)
                .jsonPath("$.series[0].instances").isEqualTo(2)
                .jsonPath("$.series[0].requests").isEqualTo(4)
                .jsonPath("$.series[0].errors").isEqualTo(1);
    }

    @Test
    public void metrics_nonAdmin_returns403() {
        webClient.get().uri("/gateway/runtime-source/metrics")
                .header(HEADER_SECRET_KEY, SECRET_KEY)
                .header(HEADER_USER_ID, "alice")
                .exchange()
                .expectStatus().isForbidden();
    }

    @Test
    public void metrics_unauthenticated_returns401() {
        webClient.get().uri("/gateway/runtime-source/metrics")
                .exchange()
                .expectStatus().isUnauthorized();
    }
}
