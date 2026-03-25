package com.huawei.opsfactory.gateway.proxy;

import com.huawei.opsfactory.gateway.common.constants.GatewayConstants;
import com.huawei.opsfactory.gateway.config.GatewayProperties;
import io.netty.channel.ChannelOption;
import io.netty.handler.ssl.SslContext;
import io.netty.handler.ssl.SslContextBuilder;
import io.netty.handler.ssl.util.InsecureTrustManagerFactory;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientRequestException;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;

import javax.net.ssl.SSLException;
import java.time.Duration;
import java.util.concurrent.TimeoutException;

@Component
public class GoosedProxy {

    private static final Logger log = LogManager.getLogger(GoosedProxy.class);

    private final WebClient webClient;
    private final GatewayProperties properties;

    public GoosedProxy(GatewayProperties properties) {
        this.properties = properties;

        // Use newConnection() to disable connection pooling.
        // Each goosed instance is localhost on a dynamic port; pooled connections
        // become stale when a goosed process restarts on a different port,
        // causing SslHandshakeTimeoutException cascades.
        HttpClient httpClient = HttpClient.newConnection()
                .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 5000);

        if (properties.isGooseTls()) {
            try {
                SslContext sslContext = SslContextBuilder.forClient()
                        .trustManager(InsecureTrustManagerFactory.INSTANCE)
                        .build();
                httpClient = httpClient.secure(t -> t.sslContext(sslContext)
                        .handshakeTimeout(Duration.ofSeconds(5)));
            } catch (SSLException e) {
                throw new RuntimeException("Failed to configure TLS for goosed proxy", e);
            }
        }

        this.webClient = WebClient.builder()
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .codecs(configurer -> configurer.defaultCodecs()
                        .maxInMemorySize(50 * 1024 * 1024))
                .build();
    }

    public String goosedBaseUrl(int port) {
        return properties.gooseScheme() + "://127.0.0.1:" + port;
    }

    /**
     * Proxy an arbitrary request to a goosed instance.
     */
    public Mono<Void> proxy(ServerHttpRequest request, ServerHttpResponse response, int port, String path, String secretKey) {
        String target = goosedBaseUrl(port) + path;
        HttpMethod method = request.getMethod();

        WebClient.RequestBodySpec spec = webClient.method(method != null ? method : HttpMethod.GET)
                .uri(target)
                .headers(h -> copyHeaders(request.getHeaders(), h, secretKey));

        WebClient.RequestHeadersSpec<?> ready;
        if (method == HttpMethod.POST || method == HttpMethod.PUT || method == HttpMethod.PATCH) {
            ready = spec.body(BodyInserters.fromDataBuffers(request.getBody()));
        } else {
            ready = spec;
        }

        return ready.exchangeToMono(upstream -> {
            response.setStatusCode(upstream.statusCode());
            copyUpstreamHeaders(upstream.headers().asHttpHeaders(), response.getHeaders());
            return response.writeWith(upstream.bodyToFlux(DataBuffer.class));
        }).timeout(Duration.ofSeconds(60))
                .onErrorMap(this::isProxyError, this::mapProxyError);
    }

    /**
     * Proxy with a pre-read JSON body string (for routes that need body inspection).
     */
    public Mono<Void> proxyWithBody(ServerHttpResponse response, int port, String path,
                                     HttpMethod method, String body, String secretKey) {
        String target = goosedBaseUrl(port) + path;

        return webClient.method(method)
                .uri(target)
                .header(GatewayConstants.HEADER_SECRET_KEY, secretKey)
                .header(HttpHeaders.CONTENT_TYPE, "application/json")
                .bodyValue(body)
                .exchangeToMono(upstream -> {
                    response.setStatusCode(upstream.statusCode());
                    copyUpstreamHeaders(upstream.headers().asHttpHeaders(), response.getHeaders());
                    return response.writeWith(upstream.bodyToFlux(DataBuffer.class));
                }).timeout(Duration.ofSeconds(60))
                .onErrorMap(this::isProxyError, this::mapProxyError);
    }

    /**
     * Fetch JSON from a goosed instance and return the raw body string.
     */
    public Mono<String> fetchJson(int port, String path, String secretKey) {
        String target = goosedBaseUrl(port) + path;
        return webClient.get()
                .uri(target)
                .header(GatewayConstants.HEADER_SECRET_KEY, secretKey)
                .retrieve()
                .bodyToMono(String.class)
                .timeout(Duration.ofSeconds(30));
    }

    public Mono<String> fetchJson(int port, HttpMethod method, String path, String body, String secretKey) {
        return fetchJson(port, method, path, body, 30, secretKey);
    }

    public Mono<String> fetchJson(int port, HttpMethod method, String path, String body, int timeoutSec, String secretKey) {
        String target = goosedBaseUrl(port) + path;
        WebClient.RequestBodySpec spec = webClient.method(method)
                .uri(target)
                .header(GatewayConstants.HEADER_SECRET_KEY, secretKey)
                .header(HttpHeaders.CONTENT_TYPE, "application/json");

        WebClient.RequestHeadersSpec<?> ready = body != null ? spec.bodyValue(body) : spec;

        return ready.retrieve()
                .bodyToMono(String.class)
                .timeout(Duration.ofSeconds(timeoutSec))
                .onErrorMap(this::isProxyError, this::mapProxyError);
    }

    public WebClient getWebClient() {
        return webClient;
    }


    private boolean isProxyError(Throwable e) {
        return e instanceof WebClientRequestException || e instanceof TimeoutException;
    }

    /**
     * Map low-level Netty connection errors and timeouts to 503 Service Unavailable
     * instead of letting them bubble as 500 Internal Server Error.
     */
    private Throwable mapProxyError(Throwable e) {
        if (e instanceof TimeoutException) {
            log.warn("Goosed proxy timeout: {}", e.getMessage());
            return new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT,
                    "Agent did not respond in time");
        }
        log.warn("Goosed connection error: {}", e.getMessage());
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "Agent temporarily unavailable: " + e.getMessage());
    }

    private void copyHeaders(HttpHeaders source, HttpHeaders target, String secretKey) {
        target.addAll(source);
        target.set(GatewayConstants.HEADER_SECRET_KEY, secretKey);
    }

    private void copyUpstreamHeaders(HttpHeaders source, HttpHeaders target) {
        // CORS is handled by gateway filter; do not forward upstream CORS headers.
        source.forEach((name, values) -> {
            if (HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN.equalsIgnoreCase(name)
                    || HttpHeaders.ACCESS_CONTROL_ALLOW_METHODS.equalsIgnoreCase(name)
                    || HttpHeaders.ACCESS_CONTROL_ALLOW_HEADERS.equalsIgnoreCase(name)
                    || HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS.equalsIgnoreCase(name)
                    || HttpHeaders.ACCESS_CONTROL_MAX_AGE.equalsIgnoreCase(name)
                    || HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS.equalsIgnoreCase(name)) {
                return;
            }
            target.put(name, values);
        });
    }
}
