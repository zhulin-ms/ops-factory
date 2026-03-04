#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Langfuse service control (Docker Compose)
#
# Usage: ./ctl.sh <action>
#   action: startup | shutdown | status | restart
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(dirname "${SCRIPT_DIR}")"

# --- Configuration (overridable via env) ---
LANGFUSE_PORT="${LANGFUSE_PORT:-3100}"
COMPOSE_FILE="${SERVICE_DIR}/docker-compose.yml"

# --- Logging ---
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'
log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_fail()  { echo -e "${RED}[FAIL]${NC}  $1"; }

# --- Utilities ---
wait_http_ok() {
    local name="$1" url="$2" attempts="${3:-60}" delay="${4:-1}"
    for ((i=1; i<=attempts; i++)); do
        curl -fsS "${url}" >/dev/null 2>&1 && return 0
        sleep "${delay}"
    done
    log_error "${name} health check failed: ${url}"
    return 1
}

# --- Langfuse actions ---
do_startup() {
    if docker ps --format '{{.Names}}' | grep -q '^langfuse$'; then
        log_info "Langfuse already running"
    else
        log_info "Starting Langfuse (port ${LANGFUSE_PORT})..."
        docker compose -f "${COMPOSE_FILE}" up -d
    fi

    log_info "Checking Langfuse readiness (timeout: 60s)..."
    if ! wait_http_ok "Langfuse" "http://127.0.0.1:${LANGFUSE_PORT}/api/public/health" 60 1; then
        log_error "Langfuse health check failed"
        return 1
    fi
    log_info "Langfuse ready at http://localhost:${LANGFUSE_PORT}"
}

do_shutdown() {
    if docker ps --format '{{.Names}}' | grep -q '^langfuse$'; then
        log_info "Stopping Langfuse..."
        docker compose -f "${COMPOSE_FILE}" down
    fi
}

do_status() {
    if docker ps --format '{{.Names}}' | grep -q '^langfuse$'; then
        if curl -fsS "http://127.0.0.1:${LANGFUSE_PORT}/api/public/health" >/dev/null 2>&1; then
            log_ok "Langfuse running (http://localhost:${LANGFUSE_PORT})"
        else
            log_warn "Langfuse container running but health check failed"
            return 1
        fi
    else
        log_fail "Langfuse is not running"
        return 1
    fi
}

do_restart() {
    do_shutdown
    do_startup
}

# --- Main ---
usage() {
    cat <<EOF
Usage: $(basename "$0") <action>

Actions:
  startup     Start Langfuse (Docker Compose)
  shutdown    Stop Langfuse
  status      Check Langfuse status
  restart     Restart Langfuse
EOF
    exit 1
}

ACTION="${1:-}"
[ -z "${ACTION}" ] && usage

case "${ACTION}" in
    startup)  do_startup ;;
    shutdown) do_shutdown ;;
    status)   do_status ;;
    restart)  do_restart ;;
    -h|--help|help) usage ;;
    *) log_error "Unknown action: ${ACTION}"; usage ;;
esac
