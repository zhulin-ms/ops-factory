package com.huawei.opsfactory.gateway.common.util;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Process management utility using JDK 21 APIs.
 */
public final class ProcessUtil {

    private ProcessUtil() {
    }

    /**
     * Read up to maxBytes from the process stdout/stderr (requires redirectErrorStream=true).
     * Must only be called after the process has exited (isAlive() == false).
     */
    public static String readOutput(Process process, int maxBytes) {
        try {
            byte[] bytes = process.getInputStream().readNBytes(maxBytes);
            return new String(bytes, StandardCharsets.UTF_8).trim();
        } catch (IOException e) {
            return "(failed to read output: " + e.getMessage() + ")";
        }
    }

    /**
     * Get PID from a Process instance using Process.pid() (JDK 9+).
     */
    public static long getPid(Process process) {
        return process.pid();
    }

    /**
     * Check if a process is still alive.
     */
    public static boolean isAlive(Process process) {
        return process.isAlive();
    }

    /**
     * Gracefully stop a process: SIGTERM, wait, then force kill.
     */
    public static void stopGracefully(Process process, long graceMs) {
        if (!process.isAlive()) {
            return;
        }
        process.destroy();
        try {
            Thread.sleep(graceMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        if (process.isAlive()) {
            process.destroyForcibly();
        }
    }
}
