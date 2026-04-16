# Webapp Logging Operations Guide

## Scope

This document explains how to use `web-app` frontend logging for routine operational diagnosis.

The purpose is not to perform deep forensic analysis. The purpose is to help developers, testers, and operators quickly determine:

- whether the issue is in the frontend app layer
- whether the issue is tied to route initialization, data loading, mutation, streaming, or asset handling
- which request, stream, or resource should be investigated next

## Runtime Configuration and Storage

`web-app` logging configuration is loaded from:

- `web-app/config.json`

The matching example file is:

- `web-app/config.json.example`

Current supported settings are:

- `logging.level`
- `logging.consoleEnabled`
- `logging.bufferSize`
- `logging.sink`
- `logging.logDirectory`

Operationally important constraints:

- current sink: browser console
- current in-process retention: memory buffer
- current frontend filesystem log directory: none

`web-app` is a browser frontend, so it does not own a service-local rolling log file in the same way as `gateway`, `knowledge-service`, or `business-intelligence`.

If future persistence is added, the log directory will belong to the persistence endpoint or collector, not to the browser runtime itself.

## What Frontend Logging Is For

Frontend logging is intended for **basic boundary isolation**.

Typical questions it should help answer:

- Did the page fail before or after route initialization?
- Did the page load fail because of a remote request?
- Was the failure tied to a mutation or a stream?
- Was the operation cancelled, timed out, partially successful, or terminally failed?
- Which route, module, resource, and request identifiers should be used next?

If you need full business-path reconstruction, backend logs remain the primary source of truth.

## What Frontend Logging Is Not For

Do not expect frontend logging to provide:

- a full audit trail of user interaction
- complete backend causality
- raw user content for replay
- per-click analytics

If an issue requires deep backend investigation, use frontend logging only to narrow the search.

## Core Event Types

Operationally, frontend logs should be interpreted through a small set of categories:

- `app`
  - bootstrap, context init, crash
- `route`
  - enter, ready, leave
- `request`
  - outbound request summary
- `data`
  - load or refresh around page data
- `mutation`
  - create, update, delete, run, pause, resume, rebuild, import, export
- `stream`
  - open, first payload, complete, abort, fail
- `asset`
  - upload, download, preview, import, export
- `error`
  - unhandled or terminal frontend failures

## Core Identifiers

When diagnosing problems, prefer these identifiers over free-form messages:

- `pageViewId`
  - one route visit lifecycle
- `interactionId`
  - one user intent attempt
- `requestId`
  - one HTTP or SDK request
- `streamId`
  - one stream session
- `routeId`
- `moduleId`
- `sessionId`
- `agentId`
- `sourceId`
- `documentId`
- `scheduleId`

Start from the most specific ID you have.

## Basic Diagnosis Workflow

### 1. Confirm the Layer

Determine which boundary failed first:

- app bootstrap
- route initialization
- data load
- mutation
- stream
- asset

If the first visible problem is already an `app.crash`, stay in frontend diagnosis first.

If the route is healthy but a request or mutation fails, move quickly to request-level investigation.

### 2. Find the Route Context

Locate:

- `route.enter`
- `route.ready`

Interpretation:

- if `route.enter` exists but `route.ready` does not, the route likely failed during initialization
- if both exist, the route shell is probably healthy and the failure is later in data loading or user action

### 3. Check for Data Boundary Failure

Look for:

- `data.load`
- `data.refresh`
- `request.send`

Interpretation:

- `data.load fail` usually means the page is not operational for the user
- `data.refresh fail` may indicate a degraded but still partially usable page
- repeated request failures with the same `routeId` usually indicate a boundary below the page layer

### 4. Check for Mutation Failure

Look for:

- `mutation.execute`

Interpretation:

- `result=success`
  - state-changing request completed
- `result=partial_success`
  - some part succeeded but follow-up work failed
- `result=fail`
  - user-visible task failed and should usually be paired with an `errorCode`, `status`, or `requestId`

### 5. Check for Stream Failure

For chat or other streaming workflows, inspect:

- `stream.session`

Focus on:

- did the stream open?
- was first payload received?
- did the stream complete?
- was it aborted by user, timeout, or remote failure?

If a stream opens but never reaches first payload, the problem boundary is usually earlier than rendering the response body.

### 6. Check for Asset Failure

For preview, upload, download, import, or export issues, inspect:

- `asset.transfer`

Interpretation:

- upload failure
  - usually indicates request boundary or payload handling issue
- preview failure
  - often isolates content transformation or preview fetch issues
- import or export failure
  - may require checking both asset boundary and subsequent mutation boundary

## Preferred Triage Questions

When reading frontend logs, answer these questions in order:

1. Which `routeId` and `moduleId` were active?
2. Was the route ready?
3. Did the failure happen during `data.load`, `mutation.execute`, `stream.session`, or `asset.transfer`?
4. Is there a `requestId` or `streamId`?
5. Is the result `fail`, `partial_success`, `cancel`, or `degraded`?
6. Which business identifiers are present?

This is usually enough to decide the next troubleshooting step.

## Interpreting Results

### `success`

The boundary completed as expected.

### `partial_success`

Some of the intended work completed, but not all. Treat this as an actionable warning condition rather than a clean success.

### `cancel`

The user or client intentionally stopped the action. This is not automatically a system failure, but may still matter if cancellation is unexpected or frequent.

### `degraded`

The system recovered or fell back in a lower-quality mode. The page may still work, but the event should narrow investigation to the degraded subsystem.

### `fail`

The boundary failed to complete. This is the main signal for escalation or deeper investigation.

## Escalation Guidance

Escalate from frontend logging to backend or service-specific logs when:

- a `requestId` is available
- the same failure repeats across sessions or users
- the route is healthy but the same remote operation fails
- a stream fails after the route is already ready
- an asset operation consistently fails for the same resource type

Frontend logging should identify the boundary. Backend logging should explain the service-side cause.

## Privacy and Safety Expectations

Operational use of frontend logs must assume that:

- user-provided text is not available in full
- prompts and query text are intentionally summarized or omitted
- secrets and credentials are never logged

Do not request that frontend logging be expanded to include raw user content as a default troubleshooting step.

## Common Triage Patterns

### Route Never Ready

Symptoms:

- `route.enter` exists
- `route.ready` missing
- nearby `data.load fail` or `app.crash`

Meaning:

- likely a frontend initialization or early page dependency problem

### Page Ready but Action Fails

Symptoms:

- `route.ready` exists
- later `mutation.execute fail`

Meaning:

- page shell is fine
- failure is likely in request, validation, remote state change, or follow-up client handling

### Stream Interrupted

Symptoms:

- `stream.session` starts
- no successful completion
- `result=abort` or `result=fail`

Meaning:

- the issue is in the streaming boundary rather than the page route boundary

### Asset-Specific Failure

Symptoms:

- `asset.transfer fail`
- route and page data otherwise healthy

Meaning:

- isolate to preview, upload, download, import, or export path first

## Operational Recommendation

Use frontend logging as the first narrowing tool, not the last debugging tool.

A good operational outcome for frontend logging is:

- the failing route is known
- the failing boundary is known
- the relevant request or stream identifier is known
- the next backend or service log search target is known

That is enough for the intended scope of this system.
