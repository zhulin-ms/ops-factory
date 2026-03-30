# Onboarding

## Local Prerequisites
- Node.js 18+
- Java 21+
- Maven
- `goosed` on `PATH`
- Docker for optional services

## Recommended Startup
Use the root orchestrator for normal development:

```bash
./scripts/ctl.sh startup all
./scripts/ctl.sh status
```

For a lighter loop, start only the required services:

```bash
./scripts/ctl.sh startup gateway webapp
```

## First Checks
- Confirm `gateway/config.yaml` and `web-app/config.json` are valid for your environment.
- Use `test/` for cross-service validation, not ad hoc one-off scripts.
- Read `AGENTS.md` and the docs in `architecture/` and `development/` before large changes.
