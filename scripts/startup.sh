#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "${SCRIPT_DIR}")"
WEB_DIR="${ROOT_DIR}/web-app"
GATEWAY_DIR="${ROOT_DIR}/gateway"

# Configuration (all have defaults)
export GATEWAY_HOST="${GATEWAY_HOST:-0.0.0.0}"
export GATEWAY_PORT="${GATEWAY_PORT:-3000}"
export GATEWAY_SECRET_KEY="${GATEWAY_SECRET_KEY:-test}"
export GOOSED_BIN="${GOOSED_BIN:-goosed}"
export PROJECT_ROOT="${ROOT_DIR}"
VITE_PORT="${VITE_PORT:-5173}"

# Office preview (OnlyOffice) — only export if explicitly set, otherwise YAML defaults apply
[ -n "${OFFICE_PREVIEW_ENABLED:-}" ] && export OFFICE_PREVIEW_ENABLED
[ -n "${ONLYOFFICE_URL:-}" ] && export ONLYOFFICE_URL
[ -n "${ONLYOFFICE_FILE_BASE_URL:-}" ] && export ONLYOFFICE_FILE_BASE_URL
ONLYOFFICE_PORT="${ONLYOFFICE_PORT:-8080}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

wait_http_ok() {
    local name="$1"
    local url="$2"
    local headers="${3:-}"
    local attempts="${4:-30}"
    local delay="${5:-1}"

    for ((i=1; i<=attempts; i++)); do
        if [ -n "${headers}" ]; then
            if curl -fsS "${url}" -H "${headers}" >/dev/null 2>&1; then
                return 0
            fi
        else
            if curl -fsS "${url}" >/dev/null 2>&1; then
                return 0
            fi
        fi
        sleep "${delay}"
    done

    log_error "${name} health check failed: ${url}"
    return 1
}

wait_onlyoffice_ready() {
    local attempts="${1:-120}"
    local delay="${2:-1}"
    for ((i=1; i<=attempts; i++)); do
        if curl -fsS --connect-timeout 1 --max-time 2 "http://127.0.0.1:${ONLYOFFICE_PORT}/healthcheck" >/dev/null 2>&1 \
          || curl -fsS --connect-timeout 1 --max-time 2 "http://127.0.0.1:${ONLYOFFICE_PORT}/web-apps/apps/api/documents/api.js" >/dev/null 2>&1; then
            return 0
        fi
        if (( i % 10 == 0 )); then
            log_info "Waiting for OnlyOffice readiness... (${i}/${attempts})"
        fi
        sleep "${delay}"
    done
    log_error "OnlyOffice readiness check failed (/healthcheck and /web-apps/apps/api/documents/api.js)"
    return 1
}

patch_onlyoffice_local_config() {
    docker exec onlyoffice python3 -c '
import json
from pathlib import Path

p = Path("/etc/onlyoffice/documentserver/local.json")
try:
    cfg = json.loads(p.read_text(encoding="utf-8"))
except Exception:
    cfg = {}

services = cfg.setdefault("services", {})
co = services.setdefault("CoAuthoring", {})
token = co.setdefault("token", {})
enable = token.setdefault("enable", {})
req = enable.setdefault("request", {})
req["inbox"] = False
req["outbox"] = False
enable["browser"] = False

rfa = co.setdefault("request-filtering-agent", {})
rfa["allowPrivateIPAddress"] = True
rfa["allowMetaIPAddress"] = True

p.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
'
}

recreate_onlyoffice_container() {
    if docker ps -a --format '{{.Names}}' | grep -q '^onlyoffice$'; then
        docker rm -f onlyoffice >/dev/null 2>&1 || true
    fi
    docker run -d --name onlyoffice -p "${ONLYOFFICE_PORT}:80" -e JWT_ENABLED=false onlyoffice/documentserver >/dev/null
    log_info "OnlyOffice container recreated"
}

ensure_onlyoffice_jwt_disabled() {
    local jwt_enabled
    jwt_enabled="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' onlyoffice 2>/dev/null | rg '^JWT_ENABLED=' | tail -n1 | cut -d= -f2 || true)"
    if [ "${jwt_enabled}" != "false" ]; then
        log_warn "OnlyOffice container JWT_ENABLED is '${jwt_enabled:-<unset>}' (expected false), recreating container..."
        recreate_onlyoffice_container
    fi
}

restart_onlyoffice_services() {
    local attempts="${1:-40}"
    for ((i=1; i<=attempts; i++)); do
        if docker exec onlyoffice supervisorctl restart all >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done
    return 1
}

check_agents_running() {
    local agents_json
    agents_json="$(curl -fsS "http://127.0.0.1:${GATEWAY_PORT}/agents" -H "x-secret-key: ${GATEWAY_SECRET_KEY}" 2>/dev/null || true)"
    if [ -z "${agents_json}" ]; then
        log_error "Failed to query gateway agents status"
        return 1
    fi

    local summary
    summary="$(echo "${agents_json}" | node -e '
let data="";
process.stdin.on("data", c => data += c);
process.stdin.on("end", () => {
  try {
    const parsed = JSON.parse(data);
    const agents = Array.isArray(parsed.agents) ? parsed.agents : [];
    const running = agents.filter(a => a && a.status === "running");
    const bad = agents.filter(a => a && a.status !== "running");
    const badText = bad.map(a => `${a.id}:${a.status}`).join(", ");
    process.stdout.write(JSON.stringify({ total: agents.length, running: running.length, badText }));
  } catch {
    process.exit(2);
  }
});
')" || true

    if [ -z "${summary}" ]; then
        log_error "Failed to parse gateway agents status"
        return 1
    fi

    local total running bad
    total="$(echo "${summary}" | node -e 'const s=JSON.parse(require("fs").readFileSync(0,"utf8")); process.stdout.write(String(s.total));')"
    running="$(echo "${summary}" | node -e 'const s=JSON.parse(require("fs").readFileSync(0,"utf8")); process.stdout.write(String(s.running));')"
    bad="$(echo "${summary}" | node -e 'const s=JSON.parse(require("fs").readFileSync(0,"utf8")); process.stdout.write(String(s.badText||""));')"

    if [ "${total}" -eq 0 ]; then
        log_error "No agents available from gateway"
        return 1
    fi
    if [ "${running}" -ne "${total}" ]; then
        log_error "Goosed agents not all running (${running}/${total})"
        [ -n "${bad}" ] && log_error "Agent states: ${bad}"
        return 1
    fi

    log_info "Goosed agents running (${running}/${total})"
    return 0
}

# Cleanup on exit
cleanup() {
    if [[ -n "${GATEWAY_PID:-}" ]] && kill -0 "${GATEWAY_PID}" 2>/dev/null; then
        log_info "Stopping gateway (PID: ${GATEWAY_PID})..."
        kill "${GATEWAY_PID}" 2>/dev/null || true
        wait "${GATEWAY_PID}" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

# 1. Shutdown existing services
log_info "Shutting down existing services..."
"${SCRIPT_DIR}/shutdown.sh"

# 2. Start OnlyOffice Document Server if office preview is enabled
if [ "${OFFICE_PREVIEW_ENABLED:-true}" = "true" ]; then
    if ! docker ps --format '{{.Names}}' | grep -q '^onlyoffice$'; then
        if docker ps -a --format '{{.Names}}' | grep -q '^onlyoffice$'; then
            log_info "Starting existing OnlyOffice container..."
            docker start onlyoffice
        else
            log_info "Creating OnlyOffice Document Server container..."
            docker run -d --name onlyoffice \
                -p "${ONLYOFFICE_PORT}:80" \
                -e JWT_ENABLED=false \
                onlyoffice/documentserver
        fi
        log_info "OnlyOffice available at http://localhost:${ONLYOFFICE_PORT}"
    else
        log_info "OnlyOffice already running"
    fi

    ensure_onlyoffice_jwt_disabled

    log_info "Applying OnlyOffice local config..."
    if ! patch_onlyoffice_local_config >/dev/null 2>&1; then
        log_warn "Failed to patch local.json on existing container, recreating container..."
        recreate_onlyoffice_container
        patch_onlyoffice_local_config >/dev/null
    fi
    if restart_onlyoffice_services 40; then
        log_info "OnlyOffice config applied (private IP fetch enabled, JWT disabled)"
    else
        log_warn "OnlyOffice service reload failed; recreating container once..."
        recreate_onlyoffice_container
        patch_onlyoffice_local_config >/dev/null
        if ! restart_onlyoffice_services 40; then
            log_error "OnlyOffice services failed to reload after container recreate"
            exit 1
        fi
        log_info "OnlyOffice config applied after container recreate"
    fi

    log_info "Checking OnlyOffice readiness (timeout: 120s)..."
    if ! wait_onlyoffice_ready 120 1; then
        log_warn "OnlyOffice not ready after patch; recreating container once for self-heal..."
        recreate_onlyoffice_container
        patch_onlyoffice_local_config >/dev/null
        if ! restart_onlyoffice_services 40; then
            log_error "OnlyOffice services failed to reload after self-heal recreate"
            exit 1
        fi
        log_info "Re-checking OnlyOffice readiness after container recreate (timeout: 120s)..."
        if ! wait_onlyoffice_ready 120 1; then
            log_error "OnlyOffice is not ready. Startup aborted."
            log_error "If you want to bypass office preview, set OFFICE_PREVIEW_ENABLED=false or update gateway/config/agents.yaml officePreview.enabled=false, then rerun startup."
            exit 1
        fi
    fi
    log_info "OnlyOffice readiness check passed"
fi

# 3. Start gateway (which spawns all goosed instances)
log_info "Starting gateway at http://${GATEWAY_HOST}:${GATEWAY_PORT}"
cd "${GATEWAY_DIR}"
npx tsx src/index.ts &
GATEWAY_PID=$!

if ! kill -0 "${GATEWAY_PID}" 2>/dev/null; then
    log_error "Failed to start gateway"
    exit 1
fi

if ! wait_http_ok "Gateway" "http://127.0.0.1:${GATEWAY_PORT}/status" "x-secret-key: ${GATEWAY_SECRET_KEY}" 40 1; then
    exit 1
fi
log_info "Gateway started (PID: ${GATEWAY_PID})"

if ! check_agents_running; then
    exit 1
fi

# 4. Start webapp
log_info "Starting webapp at http://${GATEWAY_HOST}:${VITE_PORT}"
cd "${WEB_DIR}"
npm run dev -- --host "${GATEWAY_HOST}"
