package com.huawei.opsfactory.gateway.common.util;

/**
 * Lightweight JSON helpers for extracting values without a full parse.
 */
public final class JsonUtil {

    private JsonUtil() {}

    /**
     * Extract the value of a string field from a JSON body.
     * Handles both snake_case and camelCase variants for session_id/sessionId.
     *
     * @return the field value, or null if not found
     */
    public static String extractStringField(String json, String... fieldNames) {
        for (String fieldName : fieldNames) {
            String key = "\"" + fieldName + "\"";
            int idx = json.indexOf(key);
            if (idx < 0) continue;
            int colonIdx = json.indexOf(':', idx + key.length());
            if (colonIdx < 0) continue;
            int startQuote = json.indexOf('"', colonIdx + 1);
            if (startQuote < 0) continue;
            int endQuote = json.indexOf('"', startQuote + 1);
            if (endQuote < 0) continue;
            return json.substring(startQuote + 1, endQuote);
        }
        return null;
    }

    /**
     * Extract session_id (or sessionId) from a JSON request body.
     */
    public static String extractSessionId(String json) {
        return extractStringField(json, "session_id", "sessionId");
    }
}
