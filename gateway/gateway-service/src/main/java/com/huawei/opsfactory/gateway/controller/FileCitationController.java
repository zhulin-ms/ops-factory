package com.huawei.opsfactory.gateway.controller;

import com.huawei.opsfactory.gateway.service.AgentConfigService;
import com.huawei.opsfactory.gateway.service.FileService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

@RestController
@RequestMapping("/gateway/agents/{agentId}/file-citations")
public class FileCitationController {

    private final AgentConfigService agentConfigService;
    private final FileService fileService;

    public FileCitationController(AgentConfigService agentConfigService,
                                  FileService fileService) {
        this.agentConfigService = agentConfigService;
        this.fileService = fileService;
    }

    @GetMapping("/content")
    public Mono<ResponseEntity<?>> getCitationFile(@PathVariable String agentId,
                                                   @RequestParam("path") String requestedPath) {
        return Mono.<ResponseEntity<?>>fromCallable(() -> {
                    Path realRoot = agentConfigService.getKnowledgeCliRootDir(agentId).toRealPath();
                    Path candidate = Path.of(requestedPath).normalize();
                    if (!candidate.isAbsolute()) {
                        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "absolute path is required");
                    }

                    Path realFile = candidate.toRealPath();
                    if (!realFile.startsWith(realRoot) || Files.isDirectory(realFile)) {
                        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "path is outside configured root");
                    }

                    String filename = realFile.getFileName().toString();
                    String mimeType = fileService.getMimeType(filename);
                    byte[] content = Files.readAllBytes(realFile);

                    return ResponseEntity.ok()
                            .contentType(MediaType.parseMediaType(mimeType))
                            .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + filename + "\"")
                            .body(content);
                })
                .subscribeOn(Schedulers.boundedElastic())
                .onErrorMap(IOException.class, e ->
                        new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to read citation file"));
    }
}
