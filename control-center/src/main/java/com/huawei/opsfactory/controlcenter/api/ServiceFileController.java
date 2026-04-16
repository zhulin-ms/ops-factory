package com.huawei.opsfactory.controlcenter.api;

import com.huawei.opsfactory.controlcenter.control.ManagedServiceFileService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.Map;

@RestController
@RequestMapping("/control-center/services/{id}")
public class ServiceFileController {

    private final ManagedServiceFileService managedServiceFileService;

    public ServiceFileController(ManagedServiceFileService managedServiceFileService) {
        this.managedServiceFileService = managedServiceFileService;
    }

    @GetMapping("/config")
    public Map<String, Object> getConfig(@PathVariable("id") String serviceId) {
        return managedServiceFileService.readConfig(serviceId);
    }

    @PutMapping("/config")
    public Map<String, Object> updateConfig(@PathVariable("id") String serviceId,
                                            @RequestBody Map<String, String> body) {
        if (body == null || !body.containsKey("content")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "content is required");
        }
        return managedServiceFileService.writeConfig(serviceId, body.get("content"));
    }

    @GetMapping("/logs")
    public Map<String, Object> getLogs(@PathVariable("id") String serviceId,
                                       @RequestParam(defaultValue = "200") int lines) {
        return managedServiceFileService.readLogs(serviceId, lines);
    }
}
