package com.huawei.opsfactory.controlcenter.api;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/control-center")
public class StatusController {

    @GetMapping("/status")
    public Map<String, Object> status() {
        return Map.of("status", "ok");
    }
}
