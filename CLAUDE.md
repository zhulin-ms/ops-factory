# Repository Guidelines

## Project Structure & Module Organization
`ops-factory` is a multi-service monorepo. Core services live in [`gateway/`](./gateway) and [`web-app/`](./web-app). The gateway is a Java 21 Maven project split into `gateway-common` and `gateway-service`; application code is under `src/main/java` and tests under `src/test/java`. The React/Vite frontend is organized around `web-app/src/app/platform` and `web-app/src/app/modules`: platform-level shell, providers, navigation, chat, preview, renderers, panels, runtime helpers, and shared UI live under `app/platform/*`, while business modules live under `app/modules/*/<pages|components|hooks|styles>`. Root-level `web-app/src` should only retain app entrypoints and cross-cutting assets such as `App.tsx`, `main.tsx`, `assets`, `config`, `i18n`, `types`, and `utils`. Frontend tests live in `web-app/src/__tests__`. Cross-service tests live in [`test/`](./test), the TypeScript SDK in [`typescript-sdk/`](./typescript-sdk), and Docker-backed helpers in [`langfuse/`](./langfuse), [`onlyoffice/`](./onlyoffice), and [`prometheus-exporter/`](./prometheus-exporter). Agent-specific configs and skills are under `gateway/agents/*`.

## Build, Test, and Development Commands
Use the root orchestrator for local development:

```bash
./scripts/ctl.sh startup all
./scripts/ctl.sh status
./scripts/ctl.sh shutdown all
```

To set `GATEWAY_API_PASSWORD` through the orchestrator (defaults to empty):

```bash
./scripts/ctl.sh startup --apipwd mypass
```

Targeted workflows:

```bash
cd web-app && npm run dev
cd web-app && npm run check:boundaries
cd web-app && npm run test:basic
cd web-app && npm run build
cd test && npm test
cd test && npm run test:e2e
cd typescript-sdk && npm run build && npm test
cd gateway && mvn test
cd prometheus-exporter && mvn test
```

Playwright expects the app stack to already be running at `http://127.0.0.1:5173`.

## Coding Style & Naming Conventions
Follow the existing style in each module. TypeScript in this repo uses `strict` mode, 4-space indentation in app code, semicolon-light formatting, `PascalCase` for React components, `camelCase` for hooks/utilities, and `*.test.ts(x)` for tests. Java follows standard Spring conventions: `PascalCase` classes, `camelCase` members, one public class per file, package paths under `com.huawei.opsfactory`. No repo-wide ESLint/Prettier config is checked in, so keep diffs consistent with nearby files and rely on TypeScript/Maven compilation as the baseline check.

## AI Frontend Delivery Rules
When implementing or extending frontend features, do not start from page-specific styling. First identify which existing page pattern the change belongs to, then reuse the matching layout, interaction model, and visual primitives from the current app.

- Treat the route shell, section cards, toolbar/form blocks, result lists, and right-panel/detail-panel flows as the default building blocks for new UI work.
- Prefer extending `app/platform/*` capabilities before adding new page-specific wrappers or class families.
- If a feature needs a new interaction pattern, document the reason in the relevant UI or architecture doc and keep the first implementation narrow and reusable.
- Avoid inventing a new visual language per feature. Reuse the established spacing, border, radius, empty-state, banner, tag, and button treatments unless the product explicitly calls for a new shared pattern.
- For comparison, testing, or inspection workflows, default to the existing workbench model: controls and context in the main area, results in structured cards or grids, and detail inspection in the right panel or modal fallback on smaller screens.
- Frontend handoffs and PRs should call out which existing patterns were reused, which new shared primitives were introduced, and include screenshots or GIFs for validation.
- New frontend code must respect the platform/modules boundary:
  - shared shell, providers, navigation, chat, preview, renderers, panels, runtime helpers, and reusable UI primitives belong in `web-app/src/app/platform/*`
  - feature-specific pages, components, hooks, and styles belong in `web-app/src/app/modules/<module>/*`
  - modules must not import other modules directly
  - do not recreate root-level `src/pages`, `src/components`, `src/hooks`, or `src/contexts`
- Run `cd web-app && npm run check:boundaries` after frontend structural changes. The same boundary check runs in CI.

## Testing Guidelines
Use Vitest for frontend and integration coverage, Playwright for E2E, Node’s test runner for the SDK, and JUnit/Spring Boot tests for Java services. Keep frontend tests in `web-app/src/__tests__`, Java tests in `gateway/**/src/test/java`, and cross-service scenarios in `test/`. Name tests after behavior, for example `connectionError.test.ts` or `InstanceManagerTest.java`.
- For `web-app`, keep `test:basic` green and run `npm run check:boundaries` plus `npm run build` for frontend changes.
- Do not add new mock-heavy page tests that rebuild large runtime flows with `vi.mock(fetch)` or broad provider stubs. Prefer:
  - pure utility or hook tests
  - static boundary/structure tests
  - Playwright or higher-level integration coverage for real page workflows
- If a test requires extensive request mocking to simulate a full page, it usually belongs in E2E or should be redesigned around a narrower unit seam.
- Manual verification, Playwright runs, ad hoc debug scripts, and temporary E2E exercises must clean up their process artifacts before ending the task unless the user explicitly asks to keep them.
- Remove temporary process files and directories such as `output/`, `.playwright-cli/`, throwaway screenshots, scratch logs, and one-off generated fixtures when they were created only for the verification flow.
- Remove temporary runtime users or sessions created only for testing from `gateway/users/<test-user>/...`; do not leave throwaway `e2e-*`, `debug-*`, `test-*`, or similar runtime directories behind once verification is complete.
- Do not delete retained real-user runtime data such as long-lived `admin` or explicitly requested preservation targets.

## Commit & Pull Request Guidelines
Recent history favors short Conventional Commit-style subjects such as `feat：support reasoning block` and `fix：startup script`. Prefer `feat:`, `fix:`, `test:`, or `docs:` with a focused summary. PRs should describe user-visible impact, list touched services, link related issues, and include screenshots or GIFs for frontend changes. Call out config changes explicitly when `config.yaml` or service startup behavior changes.

## Collaboration Constraints
Treat [`docs/architecture/overview.md`](./docs/architecture/overview.md), [`docs/architecture/api-boundaries.md`](./docs/architecture/api-boundaries.md), [`docs/architecture/process-management.md`](./docs/architecture/process-management.md), [`docs/development/ui-guidelines.md`](./docs/development/ui-guidelines.md), and [`docs/development/logging-guidelines.md`](./docs/development/logging-guidelines.md) as the source of truth for cross-team work. Do not bypass the gateway from the frontend, do not change auth headers or SSE/event payloads without explicit review, and keep new UI work aligned with the existing route/layout/right-panel model and shared visual primitives. Any new config key must be added to the matching `config.yaml.example` and documented in the relevant development or architecture doc.
