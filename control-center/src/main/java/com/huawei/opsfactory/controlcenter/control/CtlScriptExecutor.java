package com.huawei.opsfactory.controlcenter.control;

import com.huawei.opsfactory.controlcenter.model.ServiceActionResult;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.file.Path;
import java.util.List;

@Component
public class CtlScriptExecutor {

    private static final String ANSI_PATTERN = "\\u001B\\[[;\\d]*m";

    public ServiceActionResult execute(String serviceId, String actionLabel, String ctlAction, String ctlComponent) {
        long startedAt = System.currentTimeMillis();
        try {
            Path projectRoot = Path.of("").toAbsolutePath().normalize().getParent();
            if (projectRoot == null) {
                throw new IllegalStateException("Unable to resolve project root from control-center working directory");
            }
            Path script = projectRoot.resolve("scripts").resolve("ctl.sh");
            ProcessBuilder builder = new ProcessBuilder(List.of(script.toString(), ctlAction, ctlComponent));
            builder.directory(projectRoot.toFile());
            builder.redirectErrorStream(true);
            Process process = builder.start();

            StringBuilder output = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (!output.isEmpty()) output.append('\n');
                    output.append(line);
                }
            }

            int exitCode = process.waitFor();
            long finishedAt = System.currentTimeMillis();
            String sanitized = output.toString().replaceAll(ANSI_PATTERN, "");
            return new ServiceActionResult(
                    serviceId,
                    actionLabel,
                    exitCode == 0,
                    startedAt,
                    finishedAt,
                    exitCode,
                    sanitized
            );
        } catch (Exception e) {
            long finishedAt = System.currentTimeMillis();
            return new ServiceActionResult(
                    serviceId,
                    actionLabel,
                    false,
                    startedAt,
                    finishedAt,
                    -1,
                    e.getMessage()
            );
        }
    }
}
