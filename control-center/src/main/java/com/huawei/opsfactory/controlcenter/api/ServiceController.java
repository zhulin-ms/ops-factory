package com.huawei.opsfactory.controlcenter.api;

import com.huawei.opsfactory.controlcenter.control.ServiceActionService;
import com.huawei.opsfactory.controlcenter.observe.ServiceHealthProbeService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/control-center/services")
public class ServiceController {

    private final ServiceHealthProbeService probeService;
    private final ServiceActionService actionService;

    public ServiceController(ServiceHealthProbeService probeService, ServiceActionService actionService) {
        this.probeService = probeService;
        this.actionService = actionService;
    }

    @GetMapping
    public Map<String, Object> listServices() {
        return Map.of("services", probeService.listStatuses());
    }

    @GetMapping("/{id}")
    public Object getService(@PathVariable String id) {
        return probeService.getStatus(id);
    }

    @PostMapping("/{id}/actions/restart")
    public Object restart(@PathVariable String id) {
        return actionService.restart(id);
    }

    @PostMapping("/{id}/actions/start")
    public Object start(@PathVariable String id) {
        return actionService.start(id);
    }

    @PostMapping("/{id}/actions/stop")
    public Object stop(@PathVariable String id) {
        return actionService.stop(id);
    }
}
