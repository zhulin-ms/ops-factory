package com.huawei.opsfactory.gateway.process;

import com.huawei.opsfactory.gateway.common.constants.GatewayConstants;
import com.huawei.opsfactory.gateway.config.GatewayProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class PrewarmService {

    private static final Logger log = LoggerFactory.getLogger(PrewarmService.class);

    private final InstanceManager instanceManager;
    private final GatewayProperties properties;
    private final Set<String> warmedUsers = ConcurrentHashMap.newKeySet();

    public PrewarmService(InstanceManager instanceManager, GatewayProperties properties) {
        this.instanceManager = instanceManager;
        this.properties = properties;
    }

    /**
     * Called on every authenticated request. Triggers a fire-and-forget spawn
     * of the default agent for first-time users in this gateway lifecycle.
     */
    public void onUserActivity(String userId) {
        if (!properties.getPrewarm().isEnabled()) {
            return;
        }
        if (GatewayConstants.SYSTEM_USER.equals(userId)) {
            return;
        }
        if (!warmedUsers.add(userId)) {
            return; // already warmed
        }

        String agentId = properties.getPrewarm().getDefaultAgentId();
        log.info("Pre-warming {} for user {}", agentId, userId);
        instanceManager.getOrSpawn(agentId, userId)
                .subscribe(
                        inst -> log.info("Pre-warm complete: {}:{} on port {}",
                                agentId, userId, inst.getPort()),
                        err -> log.warn("Pre-warm failed for {}:{}: {}",
                                agentId, userId, err.getMessage())
                );
    }

    /**
     * Reset pre-warm state for a user (called when all their instances are reaped).
     */
    public void clearUser(String userId) {
        warmedUsers.remove(userId);
    }
}
