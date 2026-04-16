---
name: agent-config-viewer
description: "List all ops agent configurations (excluding secrets). Use when the user asks to view agent configs, list agents, or check agent settings."
---

# Agent Config Viewer

List all agent configurations from the gateway. Follow these steps in order.

## Step 1: Find All Agents

List directories under `gateway/agents/`. Each directory is an agent.

## Step 2: Read Configs

For each agent directory, read `config/config.yaml`.

## Step 3: Filter Secrets

Before outputting, remove any sensitive values:
- Do NOT read or display `secrets.yaml`
- If a config key contains "KEY", "SECRET", "PASSWORD", or "TOKEN" in its name, replace the value with `***`

## Step 4: Output

Present all agent configs in this format:

```
## Agent Configurations

### {agent-id}
| Key | Value |
|-----|-------|
| GOOSE_PROVIDER | {value} |
| GOOSE_MODEL | {value} |
| ... | ... |

**Extensions**: {comma-separated list of enabled extensions}
```

## Rules

- Never display secret values. Always mask them.
- If a config file is missing or unreadable, note it and continue to the next agent.
- List agents in alphabetical order.
