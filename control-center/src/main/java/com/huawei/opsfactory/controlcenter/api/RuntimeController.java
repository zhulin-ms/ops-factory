package com.huawei.opsfactory.controlcenter.api;

import com.huawei.opsfactory.controlcenter.observe.GatewayRuntimeSourceClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/control-center/runtime")
public class RuntimeController {

    private final GatewayRuntimeSourceClient gatewayRuntimeSourceClient;

    public RuntimeController(GatewayRuntimeSourceClient gatewayRuntimeSourceClient) {
        this.gatewayRuntimeSourceClient = gatewayRuntimeSourceClient;
    }

    @GetMapping("/system")
    public Map<String, Object> system() {
        return gatewayRuntimeSourceClient.getSystem();
    }

    @GetMapping("/instances")
    public Map<String, Object> instances() {
        return gatewayRuntimeSourceClient.getInstances();
    }

    @GetMapping("/agents")
    public Map<String, Object> agents() {
        return gatewayRuntimeSourceClient.getAgents();
    }

    @GetMapping("/metrics")
    public Map<String, Object> metrics() {
        return gatewayRuntimeSourceClient.getMetrics();
    }
}
