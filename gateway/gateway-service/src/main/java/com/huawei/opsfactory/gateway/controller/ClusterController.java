package com.huawei.opsfactory.gateway.controller;

import com.huawei.opsfactory.gateway.service.ClusterService;
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

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/gateway/clusters")
public class ClusterController {

    private static final Logger log = LoggerFactory.getLogger(ClusterController.class);

    private final ClusterService clusterService;
    private final HostService hostService;

    public ClusterController(ClusterService clusterService, HostService hostService) {
        this.clusterService = clusterService;
        this.hostService = hostService;
    }

    @GetMapping
    public Mono<Map<String, Object>> listClusters(
            @RequestParam(value = "groupId", required = false) String groupId,
            @RequestParam(value = "type", required = false) String type,
            ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            List<Map<String, Object>> clusters = clusterService.listClusters(groupId, type);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("clusters", clusters);
            return result;
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/{id}")
    public Mono<ResponseEntity<Map<String, Object>>> getCluster(
            @PathVariable("id") String id,
            ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            try {
                Map<String, Object> cluster = clusterService.getCluster(id);
                // Attach hosts for this cluster
                List<Map<String, Object>> hosts = hostService.listHostsByCluster(id);
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("success", true);
                body.put("cluster", cluster);
                body.put("hosts", hosts);
                return ResponseEntity.ok(body);
            } catch (IllegalArgumentException e) {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("success", false);
                body.put("error", e.getMessage());
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/types")
    public Mono<Map<String, Object>> getClusterTypes(ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            List<String> types = clusterService.getClusterTypes();
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("types", types);
            return result;
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/{id}/hosts")
    public Mono<Map<String, Object>> getClusterHosts(
            @PathVariable("id") String id,
            ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            List<Map<String, Object>> hosts = hostService.listHostsByCluster(id);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("hosts", hosts);
            return result;
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping
    public Mono<ResponseEntity<Map<String, Object>>> createCluster(
            @RequestBody Map<String, Object> request,
            ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            try {
                Map<String, Object> cluster = clusterService.createCluster(request);
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("success", true);
                body.put("cluster", cluster);
                return ResponseEntity.status(HttpStatus.CREATED).body(body);
            } catch (Exception e) {
                log.error("Failed to create cluster", e);
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("success", false);
                body.put("error", e.getMessage());
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @PutMapping("/{id}")
    public Mono<ResponseEntity<Map<String, Object>>> updateCluster(
            @PathVariable("id") String id,
            @RequestBody Map<String, Object> request,
            ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            try {
                Map<String, Object> cluster = clusterService.updateCluster(id, request);
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("success", true);
                body.put("cluster", cluster);
                return ResponseEntity.ok(body);
            } catch (IllegalArgumentException e) {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("success", false);
                body.put("error", e.getMessage());
                return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
            } catch (Exception e) {
                log.error("Failed to update cluster {}", id, e);
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("success", false);
                body.put("error", e.getMessage());
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @DeleteMapping("/{id}")
    public Mono<ResponseEntity<Map<String, Object>>> deleteCluster(
            @PathVariable("id") String id,
            @RequestParam(value = "force", required = false, defaultValue = "false") boolean force,
            ServerWebExchange exchange) {
        UserContextFilter.requireAdmin(exchange);
        return Mono.fromCallable(() -> {
            try {
                boolean deleted;
                if (force) {
                    deleted = clusterService.forceDeleteCluster(id, hostService);
                } else {
                    deleted = clusterService.deleteCluster(id, hostService);
                }
                if (!deleted) {
                    Map<String, Object> body = new LinkedHashMap<>();
                    body.put("success", false);
                    body.put("error", "Cluster not found: " + id);
                    return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
                }
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("success", true);
                return ResponseEntity.ok(body);
            } catch (IllegalStateException e) {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("success", false);
                body.put("error", e.getMessage());
                return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }
}
