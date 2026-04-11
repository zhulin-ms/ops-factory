package com.huawei.opsfactory.gateway.controller;

import com.huawei.opsfactory.gateway.service.HostService;
import com.huawei.opsfactory.gateway.filter.UserContextFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/gateway/hosts")
public class HostController {

    private static final Logger log = LoggerFactory.getLogger(HostController.class);

    private final HostService hostService;

    public HostController(HostService hostService) {
        this.hostService = hostService;
    }

    @GetMapping
    public Mono<Map<String, Object>> listHosts(
            @RequestParam(value = "tags", required = false) String tags,
            ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        List<String> tagList = (tags != null && !tags.isBlank())
                ? Arrays.asList(tags.split(","))
                : Collections.emptyList();

        return Mono.fromCallable(() -> {
            List<Map<String, Object>> hosts = hostService.listHosts(tagList.toArray(new String[0]));
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("hosts", hosts);
            return result;
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/{id}")
    public Mono<ResponseEntity<Map<String, Object>>> getHost(
            @PathVariable("id") String id,
            ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            Map<String, Object> host = hostService.getHost(id);
            if (host == null) {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("success", false);
                body.put("error", "Host not found: " + id);
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
            }
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("success", true);
            body.put("host", host);
            return ResponseEntity.ok(body);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping
    public Mono<ResponseEntity<Map<String, Object>>> createHost(
            @RequestBody Map<String, Object> request,
            ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            try {
                Map<String, Object> host = hostService.createHost(request);
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("success", true);
                body.put("host", host);
                return ResponseEntity.status(HttpStatus.CREATED).body(body);
            } catch (Exception e) {
                log.error("Failed to create host", e);
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("success", false);
                body.put("error", e.getMessage());
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @PutMapping("/{id}")
    public Mono<ResponseEntity<Map<String, Object>>> updateHost(
            @PathVariable("id") String id,
            @RequestBody Map<String, Object> request,
            ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            try {
                Map<String, Object> host = hostService.updateHost(id, request);
                if (host == null) {
                    Map<String, Object> body = new LinkedHashMap<>();
                    body.put("success", false);
                    body.put("error", "Host not found: " + id);
                    return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
                }
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("success", true);
                body.put("host", host);
                return ResponseEntity.ok(body);
            } catch (Exception e) {
                log.error("Failed to update host {}", id, e);
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("success", false);
                body.put("error", e.getMessage());
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @DeleteMapping("/{id}")
    public Mono<ResponseEntity<Map<String, Object>>> deleteHost(
            @PathVariable("id") String id,
            ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            boolean deleted = hostService.deleteHost(id);
            if (!deleted) {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("success", false);
                body.put("error", "Host not found: " + id);
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
            }
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("success", true);
            return ResponseEntity.ok(body);
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/tags")
    public Mono<Map<String, Object>> getTags(ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            List<String> tags = hostService.getAllTags();
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("tags", tags);
            return result;
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping("/{id}/test")
    public Mono<Map<String, Object>> testConnectivity(
            @PathVariable("id") String id,
            ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            long startedAt = System.currentTimeMillis();
            String userId = exchange.getAttribute(UserContextFilter.USER_ID_ATTR);
            log.info("Host connectivity test started hostId={} userId={}", id, userId);
            try {
                Map<String, Object> testResult = hostService.testConnection(id);
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("success", testResult.get("success"));
                result.put("hostId", id);
                result.put("reachable", testResult.get("reachable"));
                result.put("latencyMs", testResult.get("latencyMs"));
                if (testResult.containsKey("error")) {
                    result.put("error", testResult.get("error"));
                }
                Object success = result.get("success");
                Object reachable = result.get("reachable");
                Object latencyMs = result.get("latencyMs");
                log.info(
                        "Host connectivity test completed hostId={} userId={} success={} reachable={} latencyMs={} durationMs={} testResultKeys={}",
                        id,
                        userId,
                        success,
                        reachable,
                        latencyMs,
                        System.currentTimeMillis() - startedAt,
                        testResult.keySet()
                );
                if (Boolean.FALSE.equals(success) && (reachable == null || latencyMs == null)) {
                    log.warn(
                            "Host connectivity test returned missing fields hostId={} userId={} reachable={} latencyMs={} testResultKeys={}",
                            id, userId, reachable, latencyMs, testResult.keySet()
                    );
                    if (testResult.containsKey("message")) {
                        log.warn(
                                "Host connectivity test failure message hostId={} userId={} message={}",
                                id, userId, String.valueOf(testResult.get("message"))
                        );
                    }
                }
                return result;
            } catch (Exception e) {
                log.error("Failed to test connectivity for host {} userId={}", id, userId, e);
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("success", false);
                result.put("error", e.getMessage());
                return result;
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }
}
