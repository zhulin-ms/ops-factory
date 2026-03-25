# goosed TLS Support — Test Report

**Date:** 2026-03-11
**Feature:** Gateway goose-tls config switch for goosed 1.27+ TLS support
**Test file:** `test/goosed-tls.test.ts`
**Result:** 29/29 passed + 441/441 Java unit tests passed

## Background

goosed 1.27 defaults to TLS (`tls: true`) with self-signed certificates. The Gateway previously connected to goosed via plain HTTP, causing all health checks to fail with `goosed failed to start on port XXXXX`. This feature adds a `gooseTls` switch that controls:

1. Gateway HTTP clients use HTTPS with trust-all SSL (for self-signed certs)
2. `GOOSE_TLS` environment variable is passed to goosed processes
3. External config now uses `gooseTls`, while `ctl.sh` still accepts legacy `goosedTls` for compatibility

## Config Chain

```
gateway/config.yaml (gooseTls: true)
    → ctl.sh (GOOSE_TLS env var + -Dgateway.goose-tls)
    → application.yml (goose-tls: ${GOOSE_TLS:true})
    → GatewayProperties.java (boolean gooseTls = true)
```

## Modified Files

| File | Change |
|------|--------|
| `gateway/config.yaml` | Added `gooseTls: true` |
| `gateway/scripts/ctl.sh` | Read `gooseTls` and fall back to legacy `goosedTls`, inject `-Dgateway.goose-tls` |
| `application.yml` | Added `goose-tls: ${GOOSE_TLS:true}` |
| `GatewayProperties.java` | Field, getter/setter, `gooseScheme()` |
| `InstanceManager.java` | `GOOSE_TLS` env, trust-all SSL for health checks |
| `GoosedProxy.java` | Netty insecure SSL WebClient, `goosedBaseUrl()` |
| `SseRelayService.java` | Use `goosedProxy.goosedBaseUrl()` |
| `McpController.java` | 4x `http://` → `goosedBaseUrl()` |
| `SessionService.java` | Use `goosedProxy.goosedBaseUrl()` |
| `McpEndpointE2ETest.java` | Mock `goosedBaseUrl()` |

## Test Results

### Integration Tests (vitest) — 29/29 passed

```
 ✓ config.yaml gooseTls field > gateway/config.yaml contains gooseTls key            1ms
 ✓ config.yaml gooseTls field > gooseTls defaults to true                            0ms
 ✓ ctl.sh gooseTls parsing > yaml_val reads gooseTls value                           8ms
 ✓ ctl.sh gooseTls parsing > yaml_val reads gooseTls=false                           6ms
 ✓ ctl.sh gooseTls parsing > env var GOOSE_TLS overrides config.yaml                 3ms
 ✓ ctl.sh gooseTls parsing > falls back to legacy goosedTls key when gooseTls is absent 5ms
 ✓ ctl.sh gooseTls parsing > defaults to true when config.yaml has no gooseTls       5ms
 ✓ ctl.sh Java property injection > ctl.sh contains -Dgateway.goose-tls injection    0ms
 ✓ ctl.sh Java property injection > ctl.sh reads GOOSE_TLS from yaml_val             0ms
 ✓ ctl.sh Java property injection > ctl.sh passes bash -n (syntax valid)             4ms
 ✓ application.yml goose-tls > application.yml contains goose-tls property           0ms
 ✓ no hardcoded http:// > GoosedProxy.java                                          1ms
 ✓ no hardcoded http:// > SseRelayService.java                                      0ms
 ✓ no hardcoded http:// > McpController.java                                        0ms
 ✓ no hardcoded http:// > SessionService.java                                       0ms
 ✓ no hardcoded http:// > InstanceManager.java                                      0ms
 ✓ GatewayProperties gooseTls > declares gooseTls boolean field                     0ms
 ✓ GatewayProperties gooseTls > has isGooseTls() getter                            0ms
 ✓ GatewayProperties gooseTls > has setGooseTls() setter                           0ms
 ✓ GatewayProperties gooseTls > has gooseScheme() method returning https or http   0ms
 ✓ InstanceManager GOOSE_TLS env > passes GOOSE_TLS env var to goosed               0ms
 ✓ InstanceManager GOOSE_TLS env > uses goosedBaseUrl() for health check            0ms
 ✓ InstanceManager GOOSE_TLS env > has trust-all SSL factory for self-signed certs  0ms
 ✓ InstanceManager GOOSE_TLS env > configures HttpsURLConnection with trust-all     0ms
 ✓ GoosedProxy TLS WebClient > imports Netty SSL classes                            0ms
 ✓ GoosedProxy TLS WebClient > configures insecure SSL when gooseTls is true        0ms
 ✓ GoosedProxy TLS WebClient > uses ReactorClientHttpConnector with custom HttpClient 0ms
 ✓ GoosedProxy TLS WebClient > exposes goosedBaseUrl() method                       0ms
 ✓ gateway Java unit tests > mvn test passes                                         43270ms

 Test Files  1 passed (1)
      Tests  29 passed (29)
   Duration  43.86s
```

### Java Unit Tests (mvn test) — 441/441 passed

All existing Gateway unit tests continue to pass, confirming no regressions from the TLS changes.

## Test Coverage by Area

| Area | Tests | What is verified |
|------|-------|-----------------|
| config.yaml | 2 | `gooseTls` key exists, defaults to `true` |
| ctl.sh parsing | 5 | yaml_val reads true/false, env override, legacy-key fallback, missing-key default |
| ctl.sh injection | 3 | `-Dgateway.goose-tls` present, GOOSE_TLS read, bash syntax valid |
| application.yml | 1 | Spring property placeholder `${GOOSE_TLS:true}` on `goose-tls` |
| No hardcoded http | 5 | 5 source files have no `"http://127.0.0.1:" + port` patterns |
| GatewayProperties | 4 | Field, getter, setter, `gooseScheme()` |
| InstanceManager | 4 | GOOSE_TLS env, goosedBaseUrl, trust-all SSL, HttpsURLConnection |
| GoosedProxy | 4 | Netty SSL imports, insecure config, ReactorClientHttpConnector, goosedBaseUrl |
| Java unit tests | 1 | Full `mvn test` passes (441 tests, 0 failures, 0 errors) |
