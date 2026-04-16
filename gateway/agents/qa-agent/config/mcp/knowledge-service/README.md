# Knowledge Service MCP for qa-agent

This MCP server exposes `search` and `fetch` tools backed by `knowledge-service`.

## Runtime registration

The extension is registered in:

- `gateway/agents/qa-agent/config/config.yaml`

Extension name: `knowledge-service`

The default knowledge source is configured in:

- `extensions.knowledge-service.x-opsfactory.knowledgeScope.sourceId`

## Tools

| Tool | Usage |
|------|-------|
| `search` | Search chunk candidates from the configured knowledge sources. Uses the `config.yaml` knowledge scope when `sourceIds` is omitted. |
| `fetch` | Fetch full chunk content and optional neighbor chunks for a known `chunkId`. |

## Environment

Required secrets in `gateway/agents/qa-agent/config/secrets.yaml`:

- `KNOWLEDGE_SERVICE_URL`

Optional:

- `KNOWLEDGE_REQUEST_TIMEOUT_MS`

## Logging

- Runtime log path: `${GOOSE_PATH_ROOT}/logs/mcp/knowledge_service.log`
- If `GOOSE_PATH_ROOT` is unavailable, the fallback path is `./logs/mcp/knowledge_service.log` from the agent runtime root.

## Usage policy

- Intended for RAG only.
- Prefer `search` first, then `fetch` promising chunks.
- Keep final answers concise and cite chunk-level evidence.
