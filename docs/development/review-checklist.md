# Review Checklist

Use this checklist for PR review, especially when multiple teams or AI contributors are involved.

## Scope
- The change solves one clear problem and does not bundle unrelated refactors.
- Renames, file moves, and cleanup are justified by the task rather than incidental.
- Cross-service coupling is described clearly in the PR.

## Architecture
- Frontend still talks through the gateway rather than bypassing it.
- Route prefixes, auth headers, and streaming contracts remain compatible, or the breaking change is explicit.
- Agent-specific logic stays under agent config/runtime boundaries instead of leaking into unrelated modules.

## UI
- Existing navigation, page layout, and right-panel behavior are preserved unless the PR is intentionally redesigning them.
- User-facing strings are consistent with existing i18n patterns.
- Error handling and loading behavior match established frontend patterns.

## Configuration And Ops
- New config keys are added to the correct config example file.
- Startup or runtime behavior changes are reflected in scripts and docs where needed.
- Optional services remain optional unless the design intentionally changes that contract.

## Tests
- The PR includes regression coverage appropriate to the touched layer.
- Contract changes update affected integration/E2E tests.
- Test instructions in the PR are sufficient for another team to verify the change.

## Documentation
- `AGENTS.md` is updated if the change introduces a new non-negotiable contributor rule.
- Detailed collaboration or architecture changes are documented under `docs/`.
