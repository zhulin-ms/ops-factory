# Gateway Server-Side TLS Support — Test Report

**Date:** 2026-03-11
**Feature:** Gateway HTTPS support via `gatewayTls` config switch with auto-generated self-signed certificate
**Test file:** `test/gateway-tls.test.ts`
**Result:** 30/30 integration tests passed + 364/364 Java unit tests passed

## Background

从产品 DFX 角度，Gateway 对外暴露 plain HTTP 意味着 `x-secret-key` 和所有聊天内容明文传输。此功能为 Gateway 添加 HTTPS 支持：

- `gatewayTls: true` (默认) → Gateway 以 HTTPS 启动
- 首次启动时 `ctl.sh` 用 `keytool` 自动生成 PKCS12 自签名证书（10 年有效期）
- 可通过 `gatewayKeyStore` 配置自定义证书路径覆盖
- Web App 端只需将 `gatewayUrl` scheme 改为 `https://`

## Config Chain

```
gateway/config.yaml (gatewayTls: true, gatewayKeyStore, gatewayKeyStorePassword)
    → ctl.sh (GATEWAY_TLS env var + keytool cert gen + -Dserver.ssl.*)
    → Spring Boot built-in SSL (server.ssl.enabled, key-store, etc.)
```

## Modified Files

| File | Change |
|------|--------|
| `gateway/config.yaml` | Added `gatewayTls: true`, `gatewayKeyStore`, `gatewayKeyStorePassword` |
| `gateway/scripts/ctl.sh` | Read config, auto-gen cert, inject `server.ssl.*`, adapt all URLs to `GATEWAY_SCHEME` |
| `web-app/config.yaml` | `gatewayUrl` → `https://127.0.0.1:3000` |
| `web-app/config.yaml.example` | `gatewayUrl` → `https://127.0.0.1:3000` |
| `gateway/.gitignore` | Added `.gateway-keystore.p12` |

## Test Results

### Integration Tests (vitest) — 30/30 passed

```
 ✓ config.yaml gatewayTls fields > contains gatewayTls key                          0ms
 ✓ config.yaml gatewayTls fields > gatewayTls defaults to true                      0ms
 ✓ config.yaml gatewayTls fields > contains gatewayKeyStore key                     0ms
 ✓ config.yaml gatewayTls fields > contains gatewayKeyStorePassword key             0ms
 ✓ ctl.sh gatewayTls parsing > reads gatewayTls=true → GATEWAY_SCHEME=https         9ms
 ✓ ctl.sh gatewayTls parsing > reads gatewayTls=false → GATEWAY_SCHEME=http         6ms
 ✓ ctl.sh gatewayTls parsing > env var GATEWAY_TLS overrides config.yaml            3ms
 ✓ ctl.sh gatewayTls parsing > defaults to true when config.yaml has no gatewayTls  7ms
 ✓ ctl.sh keystore auto-generation > generates PKCS12 keystore                      593ms
 ✓ ctl.sh keystore auto-generation > ctl.sh contains keystore generation logic      0ms
 ✓ ctl.sh SSL property injection > injects server.ssl.enabled=true                  0ms
 ✓ ctl.sh SSL property injection > injects server.ssl.key-store                     0ms
 ✓ ctl.sh SSL property injection > injects server.ssl.key-store-password            0ms
 ✓ ctl.sh SSL property injection > injects server.ssl.key-store-type=PKCS12         0ms
 ✓ ctl.sh SSL property injection > injects server.ssl.key-alias=gateway             0ms
 ✓ ctl.sh SSL property injection > only injects SSL when GATEWAY_TLS=true           0ms
 ✓ ctl.sh no hardcoded http:// > gateway_url() uses GATEWAY_SCHEME                  0ms
 ✓ ctl.sh no hardcoded http:// > gateway_url() echo uses GATEWAY_SCHEME             0ms
 ✓ ctl.sh no hardcoded http:// > health check uses GATEWAY_SCHEME                   0ms
 ✓ ctl.sh no hardcoded http:// > check_agents_configured uses GATEWAY_SCHEME        0ms
 ✓ ctl.sh no hardcoded http:// > status display uses GATEWAY_SCHEME                 0ms
 ✓ ctl.sh no hardcoded http:// > startup log uses GATEWAY_SCHEME                    0ms
 ✓ ctl.sh no hardcoded http:// > curl uses CURL_TLS_OPTS                            0ms
 ✓ ctl.sh syntax > passes bash -n syntax check                                     4ms
 ✓ web-app gateway URL > config.yaml uses https://                                  0ms
 ✓ web-app gateway URL > config.yaml.example uses https://                          0ms
 ✓ web-app runtime.ts protocol handling > resolveGatewayUrl preserves protocol      0ms
 ✓ web-app runtime.ts protocol handling > does not hardcode http://                 0ms
 ✓ .gitignore keystore exclusion > excludes .gateway-keystore.p12                   0ms
 ✓ gateway Java unit tests > mvn test passes (354 tests)                            7134ms

 Test Files  1 passed (1)
      Tests  30 passed (30)
   Duration  7.87s
```

### Java Unit Tests (mvn test) — 354/354 passed

No Java code changes required — Gateway server-side TLS is configured entirely through Spring Boot system properties injected by `ctl.sh`.

## Test Coverage by Area

| Area | Tests | What is verified |
|------|-------|-----------------|
| config.yaml | 4 | `gatewayTls`, `gatewayKeyStore`, `gatewayKeyStorePassword` keys and defaults |
| ctl.sh parsing | 4 | yaml_val reads true/false, env override, missing-key default → scheme derivation |
| keystore generation | 2 | keytool generates valid PKCS12 keystore, ctl.sh contains generation logic |
| SSL property injection | 6 | All 5 `server.ssl.*` properties present, conditional on `GATEWAY_TLS=true` |
| No hardcoded http:// | 7 | All ctl.sh functions use `GATEWAY_SCHEME`, curl uses `CURL_TLS_OPTS` |
| ctl.sh syntax | 1 | `bash -n` passes |
| web-app config | 2 | Both `config.yaml` and `config.yaml.example` use `https://` |
| web-app runtime.ts | 2 | `new URL()` preserves protocol, no hardcoded `http://` |
| .gitignore | 1 | Auto-generated keystore excluded |
| Java unit tests | 1 | Full `mvn test` passes (354 tests, 0 failures, 0 errors) |

## Notes

- **自签名证书**：浏览器会显示安全警告。开发环境可手动信任或用 `mkcert` 生成本地信任的证书后配置 `gatewayKeyStore` 路径。生产环境配置正式 CA 签发的证书。
- **向后兼容**：设置 `gatewayTls: false` 可回退到 HTTP 模式。
- **证书复用**：keystore 仅在文件不存在时生成一次，后续启动直接复用。
