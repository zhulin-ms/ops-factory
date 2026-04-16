package com.huawei.opsfactory.controlcenter.api;

import com.huawei.opsfactory.controlcenter.observe.ObservabilityService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/control-center/observability")
public class ObservabilityController {

    private final ObservabilityService observabilityService;

    public ObservabilityController(ObservabilityService observabilityService) {
        this.observabilityService = observabilityService;
    }

    @GetMapping("/status")
    public Map<String, Object> status() {
        return observabilityService.getStatus();
    }

    @GetMapping("/overview")
    public Map<String, Object> overview(@RequestParam String from, @RequestParam String to) {
        return observabilityService.getOverview(from, to);
    }

    @GetMapping("/traces")
    public List<Map<String, Object>> traces(@RequestParam String from,
                                            @RequestParam String to,
                                            @RequestParam(defaultValue = "20") int limit,
                                            @RequestParam(defaultValue = "false") boolean errorsOnly) {
        return observabilityService.getTraces(from, to, limit, errorsOnly);
    }

    @GetMapping("/observations")
    public Map<String, Object> observations(@RequestParam String from, @RequestParam String to) {
        return observabilityService.getObservations(from, to);
    }
}
