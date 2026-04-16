package com.huawei.opsfactory.businessintelligence.common.logging;

import com.huawei.opsfactory.businessintelligence.config.BusinessIntelligenceRuntimeProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestLoggingFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RequestLoggingFilter.class);

    private final BusinessIntelligenceRuntimeProperties properties;

    public RequestLoggingFilter(BusinessIntelligenceRuntimeProperties properties) {
        this.properties = properties;
    }

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain filterChain
    ) throws ServletException, IOException {
        String requestId = resolveRequestId(request);
        response.setHeader(LoggingKeys.REQUEST_ID_HEADER, requestId);

        long startedAt = System.currentTimeMillis();
        MDC.put(LoggingKeys.REQUEST_ID, requestId);
        try {
            filterChain.doFilter(request, response);
        } finally {
            try {
                if (properties.getLogging().isAccessLogEnabled()) {
                    log.info(
                        "HTTP {} {} completed status={} durationMs={}",
                        request.getMethod(),
                        request.getRequestURI(),
                        response.getStatus(),
                        System.currentTimeMillis() - startedAt
                    );
                }
            } finally {
                MDC.remove(LoggingKeys.REQUEST_ID);
            }
        }
    }

    private String resolveRequestId(HttpServletRequest request) {
        String requestId = request.getHeader(LoggingKeys.REQUEST_ID_HEADER);
        if (requestId == null || requestId.isBlank()) {
            return UUID.randomUUID().toString();
        }
        return requestId.trim();
    }
}
