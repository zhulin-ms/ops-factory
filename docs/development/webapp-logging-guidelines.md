# Webapp Logging Guidelines

## Scope

This document defines the long-lived logging rules for `web-app`.

The goal is not to capture every UI interaction. The goal is to make frontend behavior:

- stable to instrument across feature changes
- reusable across modules
- sufficient for basic problem boundary isolation
- safe by default for user content and credentials

This document is a platform guideline for future frontend development, not a one-off implementation note for a single refactor.

## Runtime Configuration

`web-app` runtime logging settings must be expressed through:

- `web-app/config.json`
- `web-app/config.json.example`

Current runtime keys:

- `logging.level`
- `logging.consoleEnabled`
- `logging.bufferSize`
- `logging.sink`
- `logging.logDirectory`

Current supported behavior is intentionally narrow:

- `logging.sink` is currently fixed to `console`
- `logging.logDirectory` is currently `null`

This is not an omission in implementation. Browser code does not directly own a filesystem log directory in the way Java backend services do.

If a future persistent log sink is introduced, its directory belongs to the sink side, not to `web-app` itself.

## Goals

Frontend logging in this repository should answer a small set of practical questions:

- Did the app bootstrap correctly?
- Which route or page boundary failed?
- Was the failure in page initialization, data loading, mutation, stream handling, or asset handling?
- Which request or stream instance was involved?
- Was the failure recoverable, partial, user-cancelled, or terminal?

Frontend logging is **not** expected to solve every deep debugging problem on its own. It should provide enough structure for fast boundary isolation.

## Non-Goals

Do not treat frontend logging as:

- a clickstream analytics system
- a product usage tracking framework
- a replacement for backend logs
- a requirement to log every button, tab, or local UI state change
- a place to store full user prompts, file content, or large response bodies

## Stable Design Principle

`web-app` functionality will continue to change. Logging should therefore be built around **technical boundaries** rather than page-specific UI details.

Prefer stable categories such as:

- app bootstrap
- route lifecycle
- request lifecycle
- data loading
- state-changing mutations
- streams
- asset transfer or preview
- crashes and unhandled errors

Avoid designing logging around:

- specific sidebar entries
- individual button names
- temporary workflow wording
- highly page-specific interaction structures

## Event Categories

Frontend logging should use a small, stable event set.

Recommended categories:

- `app`
- `route`
- `request`
- `data`
- `mutation`
- `stream`
- `asset`
- `error`

Recommended stable event names:

- `app.bootstrap`
- `app.context_init`
- `app.crash`
- `route.enter`
- `route.ready`
- `route.leave`
- `request.send`
- `data.load`
- `data.refresh`
- `mutation.execute`
- `stream.session`
- `asset.transfer`

Business differences should primarily be expressed through fields, not by creating a new event name for each page action.

## Context Model

Do not rely on a single `actionId`.

Frontend logging should distinguish between different scopes of work:

- `pageViewId`
  - one route visit lifecycle
- `interactionId`
  - one user intent attempt, such as sending a message or deleting a resource
- `requestId`
  - one HTTP or SDK request
- `streamId`
  - one long-running stream or streaming session

These identifiers may coexist in the same event when useful.

## Required Stable Fields

Every emitted frontend log event should try to include the following fields when they are available:

- `ts`
- `level`
- `category`
- `name`
- `pageViewId`
- `interactionId`
- `routeId`
- `moduleId`
- `result`

Common optional fields:

- `requestId`
- `streamId`
- `userId`
- `agentId`
- `sessionId`
- `sourceId`
- `documentId`
- `scheduleId`
- `jobId`
- `targetType`
- `targetId`
- `method`
- `path`
- `status`
- `durationMs`
- `errorCode`
- `errorMessage`

Fields should be omitted when unknown. Do not invent placeholder values.

## Level Rules

### `INFO`

Use `INFO` for:

- app bootstrap success
- route lifecycle milestones
- request summaries
- successful data loads
- successful mutations
- successful stream completion
- successful asset operations

### `WARN`

Use `WARN` for:

- timeouts
- partial success
- degraded behavior
- recoverable failures
- user cancellation that matters for diagnosis
- stream interruption without a full application failure

### `ERROR`

Use `ERROR` for:

- app crash or render crash
- unhandled promise rejection
- terminal request failure
- terminal mutation failure
- terminal stream failure
- asset operation failure that blocks the user task

### `DEBUG`

Use `DEBUG` sparingly and keep it disabled by default.

`DEBUG` may be used for:

- temporary request diagnostics
- low-level stream state
- local troubleshooting during development

Do not rely on `DEBUG` events for normal operational boundary isolation.

## Instrumentation Boundaries

When adding or refactoring frontend code, instrument the **boundary**, not every inner step.

Minimum expectations by capability:

### Route-Based Pages

Each top-level route should emit:

- `route.enter`
- `route.ready`
- `route.leave`

### Data-Loading Pages

If a route loads remote data, emit:

- `data.load`

If it supports manual reload or polling, emit:

- `data.refresh`

### State-Changing Actions

Any user action that changes remote state should emit:

- `mutation.execute`

Examples:

- create
- update
- delete
- run
- pause
- resume
- rebuild
- import
- export

Use fields such as `intent`, `targetType`, and `targetId` to describe the operation.

### Streams

Long-running interactions such as chat streaming should emit:

- `stream.session`

The event should represent key states such as:

- open
- first payload received
- complete
- abort
- fail

Prefer a small number of state transitions over per-chunk logging.

### Assets

File or preview workflows should emit:

- `asset.transfer`

Examples:

- upload
- download
- preview
- import
- export

## Preferred API Shape

Shared logging behavior belongs in `app/platform/*`, not in page-specific helpers.

Prefer stable platform helpers such as:

- `trackRouteEnter(...)`
- `trackRouteReady(...)`
- `trackRequest(...)`
- `trackDataLoad(...)`
- `trackMutation(...)`
- `trackStream(...)`
- `trackAsset(...)`
- `captureFrontendError(...)`

The exact implementation may evolve, but the usage pattern should remain consistent across modules.

## Sensitive Data Rules

Frontend logs must not include:

- secret keys
- tokens
- cookies
- authorization headers
- full user prompts
- full chat messages
- full search query text
- file content
- markdown content
- base64 payloads
- large response bodies

Prefer summaries such as:

- length
- count
- size
- hash
- status
- duration

If a future debugging need requires logging user-provided text, it must be behind an explicit opt-in mechanism and documented with risk notes.

## Output Rules

Frontend logs should remain usable in both development and operational contexts.

Recommended behavior:

- development:
  - human-readable console output is acceptable
- production:
  - prefer structured events
  - keep verbosity low
  - keep event names stable

Current repository behavior:

- primary sink: browser console
- local diagnostic retention: in-memory buffer inside the app runtime
- filesystem log directory: none for `web-app` itself

Do not document or promise a frontend local log file path unless a dedicated persistence mechanism has been added.

Do not design the system around page-specific console statements.

## Minimum Adoption Rule

When building a new top-level page or major workflow, do not try to reach full logging coverage immediately.

The minimum acceptable adoption is:

- route lifecycle
- one data boundary if the page loads remote data
- one mutation boundary if the page changes remote state
- one stream boundary if the page uses streaming
- one asset boundary if the page handles files or previews

This keeps adoption stable and low-cost while preserving diagnostic value.

## Review Triggers

Request review when a change introduces:

- a new logging category
- a new required field
- logging of user-provided content
- page-specific logging patterns that bypass shared platform helpers
- persistent logging behavior tied to a single feature's wording or structure
