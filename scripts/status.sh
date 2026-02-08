#!/usr/bin/env bash
set -euo pipefail

GATEWAY_HOST="${GATEWAY_HOST:-127.0.0.1}"
GATEWAY_PORT="${GATEWAY_PORT:-3000}"
VITE_PORT="${VITE_PORT:-5173}"
ONLYOFFICE_PORT="${ONLYOFFICE_PORT:-8080}"

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[FAIL]${NC} $1"; }

has_fail=0
has_warn=0

SECRET_KEY="${GATEWAY_SECRET_KEY:-test}"

check_port() {
  local port="$1"
  lsof -ti:"${port}" >/dev/null 2>&1
}

check_onlyoffice_ready() {
  # Prefer official health endpoint; fallback to editor API asset endpoint.
  curl -fsS "http://127.0.0.1:${ONLYOFFICE_PORT}/healthcheck" >/dev/null 2>&1 && return 0
  curl -fsS "http://127.0.0.1:${ONLYOFFICE_PORT}/web-apps/apps/api/documents/api.js" >/dev/null 2>&1 && return 0
  return 1
}

check_goosed_ports_from_yaml() {
  local found=0
  while IFS= read -r port; do
    if [ -z "${port}" ]; then
      continue
    fi
    found=1
    if check_port "${port}"; then
      ok "Goosed agent port listening (${port})"
    else
      err "Goosed agent port not listening (${port})"
      has_fail=1
    fi
  done < <(awk '/^[[:space:]]*-[[:space:]]*id:/{in_agent=1} in_agent && /^[[:space:]]*port:[[:space:]]*[0-9]+/{gsub(/[^0-9]/,"",$2); print $2; in_agent=0}' gateway/config/agents.yaml 2>/dev/null || true)

  if [ "${found}" -eq 0 ]; then
    warn "No goosed ports found in gateway/config/agents.yaml"
    has_warn=1
  fi
}

gateway_url() {
  if curl -fsS "http://${GATEWAY_HOST}:${GATEWAY_PORT}/status" -H "x-secret-key: ${SECRET_KEY}" >/dev/null 2>&1; then
    echo "http://${GATEWAY_HOST}:${GATEWAY_PORT}"
    return 0
  fi
  if curl -fsS "http://127.0.0.1:${GATEWAY_PORT}/status" -H "x-secret-key: ${SECRET_KEY}" >/dev/null 2>&1; then
    echo "http://127.0.0.1:${GATEWAY_PORT}"
    return 0
  fi
  # Fallback: unknown secret key. 401 still means gateway is reachable.
  if [ "$(curl -s -o /dev/null -w "%{http_code}" "http://${GATEWAY_HOST}:${GATEWAY_PORT}/status" 2>/dev/null || true)" = "401" ]; then
    echo "http://${GATEWAY_HOST}:${GATEWAY_PORT}"
    return 0
  fi
  if [ "$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${GATEWAY_PORT}/status" 2>/dev/null || true)" = "401" ]; then
    echo "http://127.0.0.1:${GATEWAY_PORT}"
    return 0
  fi
  return 1
}

echo "Service status:"
echo "--------------"

# OnlyOffice (Docker container + HTTP)
if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^onlyoffice$'; then
  if check_onlyoffice_ready; then
    ok "OnlyOffice running (container: onlyoffice, url: http://localhost:${ONLYOFFICE_PORT})"
  else
    warn "OnlyOffice container running but readiness check failed (/healthcheck and /web-apps/apps/api/documents/api.js)"
    has_warn=1
  fi
else
  err "OnlyOffice container is not running"
  has_fail=1
fi

# Gateway (port + /status)
GATEWAY_BASE_URL=""
if check_port "${GATEWAY_PORT}"; then
  if GATEWAY_BASE_URL="$(gateway_url)"; then
    ok "Gateway running (url: http://localhost:${GATEWAY_PORT})"
  else
    err "Gateway port is open but /status check failed (http://localhost:${GATEWAY_PORT}/status)"
    has_fail=1
  fi
else
  err "Gateway is not running on port ${GATEWAY_PORT}"
  has_fail=1
fi

# Goosed agents (queried via gateway /agents)
if [ -n "${GATEWAY_BASE_URL}" ]; then
  AGENTS_HTTP_CODE="$(curl -s -o /dev/null -w "%{http_code}" "${GATEWAY_BASE_URL}/agents" -H "x-secret-key: ${SECRET_KEY}" 2>/dev/null || true)"
  AGENTS_JSON="$(curl -fsS "${GATEWAY_BASE_URL}/agents" -H "x-secret-key: ${SECRET_KEY}" 2>/dev/null || true)"
  if [ -n "${AGENTS_JSON}" ]; then
    AGENT_SUMMARY="$(echo "${AGENTS_JSON}" | node -e '
let data = "";
process.stdin.on("data", c => data += c);
process.stdin.on("end", () => {
  try {
    const parsed = JSON.parse(data);
    const agents = Array.isArray(parsed.agents) ? parsed.agents : [];
    const running = agents.filter(a => a && a.status === "running");
    const bad = agents.filter(a => a && a.status !== "running");
    const badText = bad.map(a => `${a.id}:${a.status}`).join(", ");
    process.stdout.write(JSON.stringify({
      total: agents.length,
      running: running.length,
      badText
    }));
  } catch {
    process.exit(2);
  }
});
')" || true
    if [ -n "${AGENT_SUMMARY}" ]; then
      AGENT_TOTAL="$(echo "${AGENT_SUMMARY}" | node -e 'const s=JSON.parse(require("fs").readFileSync(0,"utf8")); process.stdout.write(String(s.total));')"
      AGENT_RUNNING="$(echo "${AGENT_SUMMARY}" | node -e 'const s=JSON.parse(require("fs").readFileSync(0,"utf8")); process.stdout.write(String(s.running));')"
      AGENT_BAD="$(echo "${AGENT_SUMMARY}" | node -e 'const s=JSON.parse(require("fs").readFileSync(0,"utf8")); process.stdout.write(String(s.badText||""));')"
      if [ "${AGENT_TOTAL}" -eq 0 ]; then
        err "Goosed agents: none configured/visible via gateway"
        has_fail=1
      elif [ "${AGENT_RUNNING}" -eq "${AGENT_TOTAL}" ]; then
        ok "Goosed agents running (${AGENT_RUNNING}/${AGENT_TOTAL})"
      else
        err "Goosed agents not all running (${AGENT_RUNNING}/${AGENT_TOTAL})"
        err "Agent states: ${AGENT_BAD}"
        has_fail=1
      fi
    else
      err "Failed to parse gateway /agents response"
      has_fail=1
    fi
  else
    if [ "${AGENTS_HTTP_CODE}" = "401" ] || [ "${AGENTS_HTTP_CODE}" = "403" ]; then
      warn "Cannot read /agents with current GATEWAY_SECRET_KEY; fallback to port checks"
      has_warn=1
      check_goosed_ports_from_yaml
    else
      err "Failed to query gateway /agents"
      has_fail=1
    fi
  fi
else
  warn "Gateway unavailable; fallback to goosed port checks"
  has_warn=1
  check_goosed_ports_from_yaml
fi

# Web app (vite)
if check_port "${VITE_PORT}"; then
  if curl -fsS "http://127.0.0.1:${VITE_PORT}" >/dev/null 2>&1; then
    ok "Web app running (url: http://localhost:${VITE_PORT})"
  else
    warn "Web app port is open but HTTP check failed (http://localhost:${VITE_PORT})"
    has_warn=1
  fi
else
  err "Web app is not running on port ${VITE_PORT}"
  has_fail=1
fi

echo
if [ "${has_fail}" -eq 0 ]; then
  if [ "${has_warn}" -eq 0 ]; then
    ok "All core services are up"
  else
    warn "Core services are up, but there are warnings"
  fi
else
  err "One or more core services are down"
fi

exit "${has_fail}"
