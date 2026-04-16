package com.huawei.opsfactory.gateway.filter;

import com.huawei.opsfactory.gateway.config.GatewayProperties;
import java.util.UUID;
import org.apache.logging.log4j.ThreadContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

@Component
@Order(1)
public class RequestContextFilter implements WebFilter {

    public static final String REQUEST_ID_ATTR = "requestId";
    public static final String REQUEST_ID_HEADER = "X-Request-Id";

    private static final Logger log = LoggerFactory.getLogger(RequestContextFilter.class);

    private final GatewayProperties properties;

    public RequestContextFilter(GatewayProperties properties) {
        this.properties = properties;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String requestId = resolveRequestId(request);
        long startedAt = System.currentTimeMillis();

        exchange.getAttributes().put(REQUEST_ID_ATTR, requestId);
        exchange.getResponse().getHeaders().set(REQUEST_ID_HEADER, requestId);
        ThreadContext.put("requestId", requestId);

        return chain.filter(exchange)
            .doFinally(signalType -> {
                if (!properties.getLogging().isAccessLogEnabled()) {
                    ThreadContext.remove("requestId");
                    ThreadContext.remove("userId");
                    return;
                }
                Integer status = exchange.getResponse().getRawStatusCode();
                String userId = exchange.getAttribute(UserContextFilter.USER_ID_ATTR);
                try {
                    ThreadContext.put("requestId", requestId);
                    if (userId != null && !userId.isBlank()) {
                        ThreadContext.put("userId", userId);
                    }
                    log.info(
                        "HTTP {} {} completed status={} durationMs={}",
                        request.getMethodValue(),
                        request.getURI().getPath(),
                        status != null ? status : 200,
                        System.currentTimeMillis() - startedAt
                    );
                } finally {
                    ThreadContext.remove("requestId");
                    ThreadContext.remove("userId");
                }
            });
    }

    private String resolveRequestId(ServerHttpRequest request) {
        String requestId = request.getHeaders().getFirst(REQUEST_ID_HEADER);
        if (requestId == null || requestId.isBlank()) {
            return UUID.randomUUID().toString();
        }
        return requestId.trim();
    }
}
