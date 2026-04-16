package com.huawei.opsfactory.knowledge.common.error;

import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.MethodArgumentNotValidException;

@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException ex) {
        log.warn("Request failed with resource lookup error: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of(
            "code", "RESOURCE_NOT_FOUND",
            "message", ex.getMessage()
        ));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalState(IllegalStateException ex) {
        log.warn("Request failed with illegal state: {}", ex.getMessage());
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
            "code", "REQUEST_FAILED",
            "message", ex.getMessage()
        ));
    }

    @ExceptionHandler(ApiConflictException.class)
    public ResponseEntity<Map<String, Object>> handleConflict(ApiConflictException ex) {
        log.warn("Request failed with conflict code={} message={}", ex.code(), ex.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
            "code", ex.code(),
            "message", ex.getMessage()
        ));
    }

    @ExceptionHandler(RetrievalConfigurationException.class)
    public ResponseEntity<Map<String, Object>> handleRetrievalConfiguration(RetrievalConfigurationException ex) {
        log.error("Retrieval configuration error", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
            "code", "RETRIEVAL_CONFIGURATION_ERROR",
            "message", ex.getMessage()
        ));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
            .findFirst()
            .map(FieldError::getDefaultMessage)
            .orElse("Request validation failed");
        log.warn("Request validation failed: {}", message);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of(
            "code", "VALIDATION_FAILED",
            "message", message
        ));
    }
}
