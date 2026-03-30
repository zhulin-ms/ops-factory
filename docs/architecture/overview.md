# Architecture Overview

## Purpose
This repository is a multi-service agent platform. The main development boundary is: `web-app` presents UI, `gateway` owns orchestration and API entry, agent runtimes execute work, and support services such as `langfuse`, `onlyoffice`, and `prometheus-exporter` remain optional integrations.

## Service Responsibilities
- `web-app/`: React/Vite frontend for chat, files, history, monitoring, settings, and agent configuration.
- `gateway/`: single backend entry for auth, routing, process management, config CRUD, file access, and session orchestration.
- `gateway/agents/*`: per-agent config, skills, memory, and provider definitions.
- `typescript-sdk/`: typed client library for programmatic gateway access.
- `test/`: cross-service integration and E2E coverage.

## Non-Negotiable Boundaries
- Frontend traffic must go through the gateway; do not add direct calls from UI to providers or local agent runtimes.
- Agent-specific behavior belongs under `gateway/agents/<agent-id>/config`, not hardcoded into unrelated services.
- Cross-service changes should preserve existing route prefixes, auth headers, and file/session semantics unless explicitly reviewed.
- Optional services must remain optional; local development should still support running only gateway and webapp.

## Configuration Rule
Default precedence is service config with environment variable override. Most services use `config.yaml`; the web app runtime config uses `config.json`. When adding a setting, update the owning service’s matching config example file, startup script assumptions, and the matching documentation. Complex structured gateway runtime settings such as resident-instance lists may be sourced directly from `gateway/config.yaml` when they do not map cleanly to flat environment overrides.
