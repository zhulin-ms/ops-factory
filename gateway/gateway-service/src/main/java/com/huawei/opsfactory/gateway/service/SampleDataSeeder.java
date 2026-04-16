package com.huawei.opsfactory.gateway.service;

import com.huawei.opsfactory.gateway.config.GatewayProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;

/**
 * Placeholder seeder — sample data is now injected via E2E test.
 * Kept as a no-op to preserve Spring injection wiring.
 */
@Service
public class SampleDataSeeder {

    private static final Logger log = LoggerFactory.getLogger(SampleDataSeeder.class);

    public SampleDataSeeder(GatewayProperties properties,
                            HostService hostService,
                            HostGroupService hostGroupService,
                            ClusterService clusterService,
                            HostRelationService hostRelationService) {
        // Dependencies kept for injection compatibility but not used
    }

    @PostConstruct
    public void init() {
        log.info("SampleDataSeeder is a no-op — data is injected via E2E tests");
    }
}
