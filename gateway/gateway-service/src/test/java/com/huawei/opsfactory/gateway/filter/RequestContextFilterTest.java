package com.huawei.opsfactory.gateway.filter;

import com.huawei.opsfactory.gateway.config.GatewayProperties;
import org.junit.Before;
import org.junit.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

public class RequestContextFilterTest {

    private RequestContextFilter filter;

    @Before
    public void setUp() {
        GatewayProperties properties = new GatewayProperties();
        filter = new RequestContextFilter(properties);
    }

    @Test
    public void testGeneratesRequestIdWhenMissing() {
        MockServerHttpRequest request = MockServerHttpRequest.get("/gateway/status").build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        WebFilterChain chain = ex -> Mono.empty();
        StepVerifier.create(filter.filter(exchange, chain))
            .verifyComplete();

        String requestId = exchange.getAttribute(RequestContextFilter.REQUEST_ID_ATTR);
        assertNotNull(requestId);
        assertEquals(requestId, exchange.getResponse().getHeaders().getFirst(RequestContextFilter.REQUEST_ID_HEADER));
    }

    @Test
    public void testReusesIncomingRequestId() {
        MockServerHttpRequest request = MockServerHttpRequest.get("/gateway/status")
            .header(RequestContextFilter.REQUEST_ID_HEADER, "req-123")
            .build();
        MockServerWebExchange exchange = MockServerWebExchange.from(request);

        WebFilterChain chain = ex -> Mono.empty();
        StepVerifier.create(filter.filter(exchange, chain))
            .verifyComplete();

        assertEquals("req-123", exchange.getAttribute(RequestContextFilter.REQUEST_ID_ATTR));
        assertEquals("req-123", exchange.getResponse().getHeaders().getFirst(RequestContextFilter.REQUEST_ID_HEADER));
    }
}
