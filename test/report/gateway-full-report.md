# Gateway Full Test Report

**Date**: 2026-03-14
**Gateway version**: commit efd00b2 + code quality fixes + test fixes

---

## 1. Unit Tests (Java — mvn test)

**Result: 353 pass / 0 fail / 353 total**

| Category | Tests | Status |
|----------|-------|--------|
| gateway-common (models, utils) | 41 | All pass |
| Controllers (unit) | 43 | All pass |
| Services | 71 | All pass |
| Hooks & Filters | 75 | All pass |
| Process Management | 39 | All pass |
| Proxy & Relay | 12 | All pass |
| E2E (Spring Boot mock) | 122 | All pass |

---

## 2. Integration Tests (vitest — real gateway + goosed)

**Result: 108 pass / 0 fail / 108 total**

Duration: 87.96s

---

## 3. User Journey E2E Tests (vitest — real gateway + goosed + LLM)

**Result: 27 pass / 0 fail / 27 total**

| Journey | Scenario | Steps | Duration | Status |
|---------|----------|-------|----------|--------|
| 1 | New user multi-round chat | 7 | ~8s | PASS |
| 2 | Resume session and continue | 4 | ~4s | PASS |
| 3 | Tool call verification (shell, file ops) | 5 | ~18s | PASS |
| 4 | Stop generation mid-stream | 3 | ~4s | PASS |
| 5 | Multi-user concurrent isolation | 3 | ~2s | PASS |
| 6 | File upload and reference in chat | 5 | ~4s | PASS |

Duration: 44.85s

---

## 4. Stress Tests (vitest — concurrent users)

**Result: 80 pass / 0 fail / 80 total (2 test cases)**

### Test A: 3 users x 10 rounds (simple chat)
```
╔════════════════════════════════════════════════════════╗
║ Stress Test: Test A: 3 users x 10 rounds (simple)     ║
╠════════════════════════════════════════════════════════╣
║ Success rate: 100% (30/30)                             ║
╠────────────────────────────────────────────────────────╣
║ User          | Pass | Fail | Avg(s) | Max(s)          ║
║ stress-a1     |   10 |    0 |    2.0 |    2.0          ║
║ stress-a2     |   10 |    0 |    2.0 |    2.0          ║
║ stress-a3     |   10 |    0 |    2.0 |    2.0          ║
╚════════════════════════════════════════════════════════╝
```

### Test B: 5 users x 10 rounds (with tool calls every 3rd round)
```
╔════════════════════════════════════════════════════════╗
║ Stress Test: Test B: 5 users x 10 rounds (with tools) ║
╠════════════════════════════════════════════════════════╣
║ Success rate: 100% (50/50)                             ║
╠────────────────────────────────────────────────────────╣
║ User          | Pass | Fail | Avg(s) | Max(s)          ║
║ stress-b1     |   10 |    0 |    2.4 |    4.0          ║
║ stress-b2     |   10 |    0 |    2.4 |    4.0          ║
║ stress-b3     |   10 |    0 |    2.4 |    4.0          ║
║ stress-b4     |   10 |    0 |    2.4 |    4.0          ║
║ stress-b5     |   10 |    0 |    2.4 |    4.0          ║
╚════════════════════════════════════════════════════════╝
```

Duration: 50.17s

---

## Summary

| Test Suite | Pass | Fail | Total |
|------------|------|------|-------|
| Unit tests (Java) | 353 | 0 | 353 |
| Integration (vitest) | 108 | 0 | 108 |
| User journey E2E | 27 | 0 | 27 |
| Stress tests | 80 | 0 | 80 |
| **Total** | **568** | **0** | **568** |

---

## Fixes Applied

### Gateway code quality (from /simplify review)
- **SseRelayService**: Fixed triple `peekContent` per SSE chunk (3 allocs -> 1), fixed batched Ping detection, removed unused variable
- **InstanceManager**: Moved blocking `isHealthy()` off reactor thread into `boundedElastic`
- **ReplyController**: Fixed `ensureSessionResumed` marking success on failure; deduplicated `extractSessionId`
- **JsonUtil**: New shared utility in `gateway-common` for `extractSessionId` (replaces 2 duplicate implementations)

### Test fixes
- **`test/helpers.ts`**: Added `goose-tls=true` (goosed 1.27.2 forces TLS); added default `x-user-id: sys` to `gw.fetch()`
- **Java E2E tests**: Updated `fetchJson` mocks from 4-arg to 5-arg (added `anyInt()` for timeout param)
- **`integration.test.ts`**: Updated hardcoded provider/model (`openai` -> `custom_opsagentllm`); added `Origin` header to CORS tests
- **`user-journey.test.ts`**: Fixed lazy `WebClient` init; adjusted session ID and file name assertions for goosed behavior
