# Architecture Overview

## Purpose
This repository is a multi-service agent platform. The main development boundary is: `web-app` presents UI, `gateway` owns orchestration and API entry, agent runtimes execute work, `control-center` owns platform observation and service control, and support services such as `langfuse`, `onlyoffice`, and `prometheus-exporter` remain optional integrations.

## Service Responsibilities
- `web-app/`: React/Vite frontend for chat, files, history, settings, agent configuration, and admin control-center entry points.
- `gateway/`: single backend entry for auth, routing, process management, config CRUD, file access, session orchestration, and external channel bridging for WhatsApp/WeChat.
- `control-center/`: platform control plane for service health, runtime observation, config/log access, and service actions.
- `gateway/agents/*`: per-agent config, skills, memory, and provider definitions.
- `typescript-sdk/`: typed client library for programmatic gateway access.
- `test/`: cross-service integration and E2E coverage.

## Detailed Architecture Docs
- Channel bridging design for `whatsapp` and `wechat`: [channel-module.md](./channel-module.md)

## Non-Negotiable Boundaries
- Frontend traffic must go through the gateway; do not add direct calls from UI to providers or local agent runtimes.
- Agent-specific behavior belongs under `gateway/agents/<agent-id>/config`, not hardcoded into unrelated services.
- Cross-service changes should preserve existing route prefixes, auth headers, and file/session semantics unless explicitly reviewed.
- Optional services must remain optional; local development should still support running only gateway and webapp.

## Configuration Rule
Default precedence is service config with environment variable override. Most services use `config.yaml`; the web app runtime config uses `config.json`. When adding a setting, update the owning service’s matching config example file, startup script assumptions, and the matching documentation. Complex structured gateway runtime settings such as resident-instance lists may be sourced directly from `gateway/config.yaml` when they do not map cleanly to flat environment overrides.

`control-center/config.yaml` defines managed services under `control-center.services[]`. Each entry can declare:
- `config-path`: relative path from repo root to the service config file exposed in Control Center
- `log-path`: relative path from repo root to the primary service log file exposed in Control Center
