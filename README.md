# Ops Factory

Ops Factory is a multi-service AI agent platform for running, observing, and operating agent workflows from a unified web interface. The repository combines a React/Vite frontend, a Spring Boot gateway that manages `goosed` runtimes, platform-side support services, and a TypeScript SDK for programmatic access.

The current architectural boundary is:
- `web-app` renders the UI and talks to platform services
- `gateway` is the single backend entry for agent access, sessions, files, config, and runtime orchestration
- `control-center` provides platform health, config, log, and service control views
- `knowledge-service` and `business-intelligence` provide domain services consumed by the platform
- optional integrations such as `langfuse`, `onlyoffice`, and `prometheus-exporter` stay optional

## Demo Media

### GIF Demos

#### 1. Universal Agent Planning

![Universal Agent Planning](media/demo-universal-agent-planning.gif)

#### 2. Visualization & Chart

![Visualization Chart](media/demo-visualization-chart.gif)

#### 3. Artifacts Preview

![Artifacts Preview](media/demo-artifacts-preview.gif)

#### 4. Scheduler

![Scheduler](media/demo-scheduler.gif)

#### 5. Monitoring & Observation

![Monitoring Observation](media/demo-monitoring-observation.gif)

#### 6. KB Agent (Feishu)

![KB Agent Feishu](media/demo-kb-agent-feishu.gif)

#### 7. Self-Supervisor Agent

![Self-Supervisor Agent](media/demo-self-supervisor-agent.gif)

### UI Screenshots

#### Home

![Home](media/screenshot-home.png)

#### Control Center

![Control Center](media/screenshot-control-center.png)

#### Channels

![Channels](media/screenshot-channels.png)

#### Files Preview

![Files Preview](media/screenshot-files-preview.png)

#### Knowledge Docs

![Knowledge Docs](media/screenshot-knowledge-docs.png)

#### Knowledge Recall Testing

![Knowledge Recall Testing](media/screenshot-knowledge-recall-testing.png)

## Architecture

```text
Web App (:5173)
    |
    +--> Gateway (:3000)
    |      - auth and route entry
    |      - session and file APIs
    |      - per-user goosed runtime orchestration
    |      - agent config and runtime management
    |
    +--> Knowledge Service (:8092)
    |      - document ingest, indexing, retrieval
    |
    +--> Business Intelligence (:8093, optional)
    |      - BI data APIs and workbook-backed analytics
    |
    +--> Control Center (:8094)
           - service health, logs, config, service actions

Optional integrations:
- Langfuse (:3100) for observability
- OnlyOffice (:8080) for office document preview
- Prometheus Exporter (:9091) for metrics
```

Two boundary rules matter across the repo:
- frontend traffic should not bypass the gateway for agent runtime access
- agent-specific runtime behavior belongs under `gateway/agents/<agent-id>/config`

See [docs/architecture/overview.md](./docs/architecture/overview.md) for the service-level source of truth and [docs/architecture/api-boundaries.md](./docs/architecture/api-boundaries.md) for compatibility rules.

## Core Services

| Service | Directory | Default Port | Stack | Responsibility |
| --- | --- | --- | --- | --- |
| Web App | `web-app/` | `5173` | React + Vite + TypeScript | Main UI, chat, files, preview, navigation, module pages |
| Gateway | `gateway/` | `3000` | Java 21 + Spring Boot | Auth, routing, config CRUD, file/session APIs, `goosed` runtime management |
| Knowledge Service | `knowledge-service/` | `8092` | Java 21 + Spring Boot | Knowledge ingest, indexing, retrieval, recall workflows |
| Business Intelligence | `business-intelligence/` | `8093` | Java 21 + Spring Boot | BI APIs backed by workbook-style source data |
| Control Center | `control-center/` | `8094` | Java 21 + Spring Boot | Service health, logs, config access, service control actions |
| Prometheus Exporter | `prometheus-exporter/` | `9091` | Java 21 + Spring Boot | Gateway-oriented Prometheus metrics export |
| TypeScript SDK | `typescript-sdk/` | n/a | TypeScript | Programmatic gateway client |
| Langfuse | `langfuse/` | `3100` | Docker Compose | Optional LLM observability integration |
| OnlyOffice | `onlyoffice/` | `8080` | Docker Compose | Optional office document preview |

## Repository Layout

```text
ops-factory/
├── gateway/                  # Gateway service, shared module, agent configs, scripts
├── web-app/                  # React/Vite frontend
├── knowledge-service/        # Knowledge ingest and retrieval service
├── business-intelligence/    # BI service
├── control-center/           # Platform control plane service
├── prometheus-exporter/      # Prometheus metrics exporter
├── typescript-sdk/           # @goosed/sdk client library
├── test/                     # Cross-service integration and E2E coverage
├── docs/                     # Architecture, development, and operations docs
├── media/                    # README demo GIFs and screenshots
├── langfuse/                 # Optional Langfuse docker setup
├── onlyoffice/               # Optional OnlyOffice docker setup
└── scripts/                  # Root orchestration scripts
```

Within the frontend, platform-level shell, providers, panels, preview, renderers, and shared UI live under `web-app/src/app/platform`, while business modules live under `web-app/src/app/modules`.

## Quick Start

### Requirements

- Node.js 18+
- Java 21
- Maven 3.9+
- `goosed` available on `PATH`
- Docker, if you want to run `langfuse` or `onlyoffice`

### 1. Create local config files

Mandatory for the main stack:

```bash
cp gateway/config.yaml.example gateway/config.yaml
cp web-app/config.json.example web-app/config.json
cp knowledge-service/config.yaml.example knowledge-service/config.yaml
cp control-center/config.yaml.example control-center/config.yaml
```

Optional services:

```bash
cp business-intelligence/config.yaml.example business-intelligence/config.yaml
cp prometheus-exporter/config.yaml.example prometheus-exporter/config.yaml
cp langfuse/config.yaml.example langfuse/config.yaml
cp onlyoffice/config.yaml.example onlyoffice/config.yaml
```

At minimum, set a real gateway secret in `gateway/config.yaml` and keep `web-app/config.json` aligned with your local service URLs and secrets.

### 2. Start services

Start the full local stack:

```bash
./scripts/ctl.sh startup all
./scripts/ctl.sh status
```

Stop everything:

```bash
./scripts/ctl.sh shutdown all
```

Pass the gateway API password through the orchestrator:

```bash
./scripts/ctl.sh startup --apipwd mypass
```

Run the mandatory platform stack without optional integrations:

```bash
ENABLE_ONLYOFFICE=false \
ENABLE_LANGFUSE=false \
ENABLE_BUSINESS_INTELLIGENCE=false \
ENABLE_EXPORTER=false \
./scripts/ctl.sh startup all
```

Once started, the main UI is available at [http://127.0.0.1:5173](http://127.0.0.1:5173).

## Development Commands

### Root Orchestrator

```bash
./scripts/ctl.sh startup all
./scripts/ctl.sh startup gateway knowledge control-center webapp
./scripts/ctl.sh status
./scripts/ctl.sh shutdown all
./scripts/ctl.sh restart gateway
```

### Frontend

```bash
cd web-app && npm run dev
cd web-app && npm run check:boundaries
cd web-app && npm run test:basic
cd web-app && npm run build
```

### Java Services

```bash
cd gateway && mvn test
cd knowledge-service && mvn test
cd business-intelligence && mvn test
cd control-center && mvn test
cd prometheus-exporter && mvn test
```

### SDK and Cross-Service Tests

```bash
cd typescript-sdk && npm run build && npm test
cd test && npm test
cd test && npm run test:e2e
```

Playwright expects the app stack to already be running at `http://127.0.0.1:5173`.

## Configuration

Most backend services use `config.yaml` with environment variable overrides. The web app uses runtime `config.json`.

Main config entry points:
- [`gateway/config.yaml.example`](./gateway/config.yaml.example)
- [`knowledge-service/config.yaml.example`](./knowledge-service/config.yaml.example)
- [`business-intelligence/config.yaml.example`](./business-intelligence/config.yaml.example)
- [`control-center/config.yaml.example`](./control-center/config.yaml.example)
- [`prometheus-exporter/config.yaml.example`](./prometheus-exporter/config.yaml.example)
- [`langfuse/config.yaml.example`](./langfuse/config.yaml.example)
- [`onlyoffice/config.yaml.example`](./onlyoffice/config.yaml.example)
- [`web-app/config.json.example`](./web-app/config.json.example)

When adding or changing configuration:
- update the owning service’s example config
- keep startup scripts and docs in sync
- preserve existing route, auth-header, and event payload compatibility unless the change is explicitly reviewed

## Documentation

Start here for cross-team work:
- [AGENTS.md](./AGENTS.md)
- [docs/README.md](./docs/README.md)
- [docs/architecture/overview.md](./docs/architecture/overview.md)
- [docs/architecture/api-boundaries.md](./docs/architecture/api-boundaries.md)
- [docs/architecture/process-management.md](./docs/architecture/process-management.md)
- [docs/development/ui-guidelines.md](./docs/development/ui-guidelines.md)
- [docs/development/review-checklist.md](./docs/development/review-checklist.md)

## Notes for Contributors

- Keep new frontend work aligned with the existing route shell, card layouts, and right-panel/detail-panel patterns.
- Do not add direct frontend calls to agent runtimes or providers that bypass the gateway.
- Keep shared frontend primitives in `web-app/src/app/platform/*` and feature-specific code in `web-app/src/app/modules/*`.
- Agent-specific config, skills, prompts, and runtime metadata belong under `gateway/agents/*`.
