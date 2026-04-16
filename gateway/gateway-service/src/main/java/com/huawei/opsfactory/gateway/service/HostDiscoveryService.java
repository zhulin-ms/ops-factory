package com.huawei.opsfactory.gateway.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.Session;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class HostDiscoveryService {

    private static final Logger log = LoggerFactory.getLogger(HostDiscoveryService.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String DISCOVERY_AGENT_ID = "qos-agent";

    private final HostService hostService;
    private final AgentConfigService agentConfigService;
    private final WebClient webClient;

    public HostDiscoveryService(HostService hostService, AgentConfigService agentConfigService) {
        this.hostService = hostService;
        this.agentConfigService = agentConfigService;
        this.webClient = WebClient.create();
    }

    // ── Phase 1: Plan ───────────────────────────────────────────────

    public Map<String, Object> plan(String hostId) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("hostId", hostId);

        try {
            AgentConfigService.LlmConfig llm = agentConfigService.getLlmConfig(DISCOVERY_AGENT_ID);

            Map<String, Object> host = hostService.getHost(hostId);

            String ip = String.valueOf(host.getOrDefault("ip", "unknown"));
            Object portObj = host.get("port");
            String port = portObj instanceof Number n ? String.valueOf(n.intValue()) : "22";
            String os = host.get("os") != null ? String.valueOf(host.get("os")) : "unknown";

            String systemPrompt = "你是一名经验丰富的系统管理员。需要通过 SSH 远程连接到一台主机，自动发现其属性信息。\n\n"
                    + "请规划一组探测命令来发现以下属性：hostname、操作系统版本、内核版本、CPU 信息（型号/核心数/架构）、内存容量、磁盘使用、网络接口、运行时长、主要进程。\n\n"
                    + "要求：\n"
                    + "- 所有命令必须是只读的，不能修改系统状态\n"
                    + "- 考虑不同 Linux 发行版和 macOS 的兼容性（使用 2>/dev/null 回退）\n"
                    + "- 每条命令用分号或 && 组合相关检查\n\n"
                    + "请返回严格的 JSON 格式（不要包含 markdown 代码块标记）：\n"
                    + "{\"commands\": [{\"label\": \"...\", \"command\": \"...\", \"purpose\": \"...\"}]}";

            String userPrompt = "目标主机已知信息：\n- IP: " + ip + "\n- Port: " + port + "\n- OS: " + os;

            String response = callLlm(llm, systemPrompt, userPrompt);
            Map<String, Object> parsed = parseLlmJson(response);
            @SuppressWarnings("unchecked")
            List<Map<String, String>> commands = (List<Map<String, String>>) parsed.get("commands");
            if (commands == null) {
                commands = List.of();
            }
            result.put("success", true);
            result.put("commands", commands);
        } catch (Exception e) {
            log.error("Discovery plan failed for host {}: {}", hostId, e.getMessage(), e);
            result.put("success", false);
            result.put("error", e.getMessage());
        }

        return result;
    }

    // ── Phase 2: Execute ────────────────────────────────────────────

    public Map<String, Object> execute(String hostId, List<Map<String, String>> commands) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("hostId", hostId);

        try {
            AgentConfigService.LlmConfig llm = agentConfigService.getLlmConfig(DISCOVERY_AGENT_ID);
            Map<String, Object> host = hostService.getHostWithCredential(hostId);

            String ip = (String) host.get("ip");
            int port = host.get("port") instanceof Number n ? n.intValue() : 22;
            String username = (String) host.get("username");
            String authType = (String) host.get("authType");
            String credential = (String) host.get("credential");

            // Execute commands via SSH
            Map<String, String> rawOutputs = new LinkedHashMap<>();
            Session session = null;
            try {
                JSch jsch = new JSch();
                session = jsch.getSession(username, ip, port);

                if ("key".equals(authType)) {
                    jsch.addIdentity("discovery", credential.getBytes(StandardCharsets.UTF_8), null, null);
                } else {
                    session.setPassword(credential);
                }

                session.setConfig("StrictHostKeyChecking", "no");
                session.connect(5000);

                for (Map<String, String> cmd : commands) {
                    String label = cmd.getOrDefault("label", "unknown");
                    String command = cmd.getOrDefault("command", "");
                    if (command.isEmpty()) continue;

                    String output = executeSingleCommand(session, command);
                    rawOutputs.put(label, output);
                }
            } finally {
                if (session != null) {
                    try { session.disconnect(); } catch (Exception ignored) {}
                }
            }

            // Build prompt for LLM to parse outputs
            StringBuilder outputsSection = new StringBuilder();
            for (Map.Entry<String, String> entry : rawOutputs.entrySet()) {
                outputsSection.append("--- ").append(entry.getKey()).append(" ---\n");
                outputsSection.append(entry.getValue()).append("\n\n");
            }

            String systemPrompt = "你是一名系统管理员。根据以下从远程主机收集的命令输出，提取主机属性信息。\n\n"
                    + "请返回严格的 JSON 格式（不要包含 markdown 代码块标记）：\n"
                    + "{\"hostname\": \"主机名\", \"os\": \"操作系统名称和版本\", "
                    + "\"customAttributes\": [{\"key\": \"Kernel\", \"value\": \"内核版本\"}, "
                    + "{\"key\": \"CPU Model\", \"value\": \"CPU 型号\"}, "
                    + "{\"key\": \"CPU Cores\", \"value\": \"核心数\"}, "
                    + "{\"key\": \"CPU Arch\", \"value\": \"架构\"}, "
                    + "{\"key\": \"Memory Total\", \"value\": \"总内存\"}, "
                    + "{\"key\": \"Disk\", \"value\": \"分区汇总\"}, "
                    + "{\"key\": \"Network\", \"value\": \"网卡和IP\"}, "
                    + "{\"key\": \"Uptime\", \"value\": \"运行时长\"}, "
                    + "{\"key\": \"Top Processes\", \"value\": \"内存占用前5进程\"}]}\n\n"
                    + "命令输出：\n";

            try {
                String response = callLlm(llm, systemPrompt, outputsSection.toString());
                Map<String, Object> parsed = parseLlmJson(response);

                Map<String, String> formMappings = new LinkedHashMap<>();
                if (parsed.containsKey("hostname")) {
                    formMappings.put("hostname", String.valueOf(parsed.get("hostname")));
                }
                if (parsed.containsKey("os")) {
                    formMappings.put("os", String.valueOf(parsed.get("os")));
                }

                @SuppressWarnings("unchecked")
                List<Map<String, String>> customAttrs = (List<Map<String, String>>) parsed.get("customAttributes");

                result.put("success", true);
                result.put("formMappings", formMappings);
                result.put("customAttributes", customAttrs != null ? customAttrs : List.of());
                result.put("rawOutputs", rawOutputs);
            } catch (Exception e) {
                log.warn("LLM parsing failed for host {}, returning raw outputs: {}", hostId, e.getMessage());
                result.put("success", true);
                result.put("formMappings", Map.of());
                result.put("customAttributes", List.of());
                result.put("rawOutputs", rawOutputs);
                result.put("error", "LLM parsing failed, raw outputs returned");
            }
        } catch (Exception e) {
            log.error("Discovery execute failed for host {}: {}", hostId, e.getMessage(), e);
            result.put("success", false);
            result.put("error", e.getMessage());
        }

        return result;
    }

    // ── SSH Command Execution ───────────────────────────────────────

    private String executeSingleCommand(Session session, String command) {
        ChannelExec channel = null;
        try {
            channel = (ChannelExec) session.openChannel("exec");
            channel.setCommand(command);

            InputStream in = channel.getInputStream();
            InputStream err = channel.getExtInputStream();

            ByteArrayOutputStream outputBuffer = new ByteArrayOutputStream();
            channel.connect();

            long deadline = System.currentTimeMillis() + 10_000;
            byte[] buf = new byte[4096];

            while (true) {
                if (channel.isClosed()) {
                    while (in.available() > 0) {
                        int len = in.read(buf);
                        if (len > 0) outputBuffer.write(buf, 0, len);
                    }
                    break;
                }
                while (in.available() > 0) {
                    int len = in.read(buf);
                    if (len > 0) outputBuffer.write(buf, 0, len);
                }
                if (System.currentTimeMillis() > deadline) {
                    channel.sendSignal("KILL");
                    break;
                }
                Thread.sleep(50);
            }

            return outputBuffer.toString(StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "ERROR: " + e.getMessage();
        } finally {
            if (channel != null) {
                try { channel.disconnect(); } catch (Exception ignored) {}
            }
        }
    }

    // ── LLM API Call ────────────────────────────────────────────────

    private String callLlm(AgentConfigService.LlmConfig llm, String systemPrompt, String userPrompt) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", llm.model());
        body.put("messages", List.of(
                Map.of("role", "system", "content", systemPrompt),
                Map.of("role", "user", "content", userPrompt)
        ));
        body.put("temperature", 0.1);
        body.put("max_tokens", 1024);

        log.info("Calling LLM for discovery: model={}, baseUrl={}", llm.model(), llm.baseUrl());
        try {
            String response = webClient.post()
                    .uri(llm.baseUrl())
                    .header("Authorization", "Bearer " + llm.apiKey())
                    .header("Content-Type", "application/json")
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofSeconds(30))
                    .block();
            log.debug("LLM response length={}", response != null ? response.length() : 0);
            return response;
        } catch (org.springframework.web.reactive.function.client.WebClientResponseException e) {
            String responseBody = e.getResponseBodyAsString();
            log.error("LLM API returned {}: body={}", e.getRawStatusCode(), responseBody.length() > 500 ? responseBody.substring(0, 500) : responseBody);
            throw new RuntimeException("LLM API error " + e.getRawStatusCode() + ": " + e.getStatusText(), e);
        } catch (Exception e) {
            log.error("LLM call failed: {}", e.getMessage());
            throw new RuntimeException("LLM call failed: " + e.getMessage(), e);
        }
    }

    // ── JSON Parsing ────────────────────────────────────────────────

    private Map<String, Object> parseLlmJson(String response) {
        if (response == null || response.isBlank()) {
            throw new IllegalArgumentException("Empty LLM response");
        }

        // Extract JSON from response (handle markdown code blocks)
        String json = response.trim();
        // Remove markdown code block markers if present
        if (json.startsWith("```")) {
            int firstNewline = json.indexOf('\n');
            if (firstNewline >= 0) {
                json = json.substring(firstNewline + 1);
            }
            if (json.endsWith("```")) {
                json = json.substring(0, json.length() - 3);
            }
            json = json.trim();
        }

        // If still not starting with {, try to find the JSON block
        if (!json.startsWith("{")) {
            int braceStart = json.indexOf('{');
            int braceEnd = json.lastIndexOf('}');
            if (braceStart >= 0 && braceEnd > braceStart) {
                json = json.substring(braceStart, braceEnd + 1);
            }
        }

        // Parse OpenAI-compatible response format
        try {
            Map<String, Object> outer = MAPPER.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
            // If it's an OpenAI chat completion response, extract content
            if (outer.containsKey("choices")) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> choices = (List<Map<String, Object>>) outer.get("choices");
                if (!choices.isEmpty()) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
                    if (message != null) {
                        String content = (String) message.get("content");
                        return parseLlmJson(content); // recursive parse the content
                    }
                }
            }
            return outer;
        } catch (Exception e) {
            throw new IllegalArgumentException("Failed to parse LLM JSON response: " + e.getMessage(), e);
        }
    }
}
