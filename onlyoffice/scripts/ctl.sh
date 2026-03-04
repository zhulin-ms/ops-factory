#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# OnlyOffice Document Server control (Docker)
#
# Usage: ./ctl.sh <action>
#   action: startup | shutdown | status | restart
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(dirname "${SCRIPT_DIR}")"

# --- Configuration (overridable via env) ---
ONLYOFFICE_PORT="${ONLYOFFICE_PORT:-8080}"
CONTAINER_NAME="onlyoffice"
IMAGE="onlyoffice/documentserver"

ONLYOFFICE_ENV_ARGS=(
    -e JWT_ENABLED=false
    -e PLUGINS_ENABLED=false
    -e ALLOW_PRIVATE_IP_ADDRESS=true
    -e ALLOW_META_IP_ADDRESS=true
)

# --- Logging ---
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'
log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_fail()  { echo -e "${RED}[FAIL]${NC}  $1"; }

# --- Utilities ---
container_running() {
    docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"
}

container_exists() {
    docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"
}

wait_ready() {
    local attempts="${1:-120}" delay="${2:-1}"
    for ((i=1; i<=attempts; i++)); do
        if curl -fsS --connect-timeout 1 --max-time 2 "http://127.0.0.1:${ONLYOFFICE_PORT}/healthcheck" >/dev/null 2>&1 \
          || curl -fsS --connect-timeout 1 --max-time 2 "http://127.0.0.1:${ONLYOFFICE_PORT}/web-apps/apps/api/documents/api.js" >/dev/null 2>&1; then
            return 0
        fi
        (( i % 10 == 0 )) && log_info "Waiting for OnlyOffice readiness... (${i}/${attempts})"
        sleep "${delay}"
    done
    log_error "OnlyOffice readiness check failed"
    return 1
}

recreate_container() {
    container_exists && docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
    docker run -d --name "${CONTAINER_NAME}" -p "${ONLYOFFICE_PORT}:80" "${ONLYOFFICE_ENV_ARGS[@]}" "${IMAGE}" >/dev/null
    log_info "OnlyOffice container recreated"
}

ensure_env() {
    local actual
    actual="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "${CONTAINER_NAME}" 2>/dev/null || true)"
    for expected in JWT_ENABLED=false PLUGINS_ENABLED=false ALLOW_PRIVATE_IP_ADDRESS=true ALLOW_META_IP_ADDRESS=true; do
        if ! echo "${actual}" | grep -q "^${expected}$"; then
            log_warn "OnlyOffice env mismatch (missing ${expected}), recreating..."
            recreate_container
            return
        fi
    done
}

# --- OnlyOffice actions ---
do_startup() {
    if ! container_running; then
        if container_exists; then
            log_info "Starting existing OnlyOffice container..."
            docker start "${CONTAINER_NAME}"
        else
            log_info "Creating OnlyOffice container..."
            docker run -d --name "${CONTAINER_NAME}" -p "${ONLYOFFICE_PORT}:80" "${ONLYOFFICE_ENV_ARGS[@]}" "${IMAGE}"
        fi
        log_info "OnlyOffice available at http://localhost:${ONLYOFFICE_PORT}"
    else
        log_info "OnlyOffice already running"
    fi

    ensure_env

    log_info "Checking OnlyOffice readiness (timeout: 120s)..."
    if ! wait_ready 120 1; then
        log_warn "Not ready; recreating container..."
        recreate_container
        log_info "Re-checking readiness (timeout: 120s)..."
        if ! wait_ready 120 1; then
            log_error "OnlyOffice not ready after recreate"
            return 1
        fi
    fi
    log_info "OnlyOffice readiness check passed"
}

do_shutdown() {
    if container_running; then
        log_info "Stopping OnlyOffice container..."
        docker stop "${CONTAINER_NAME}" 2>/dev/null || true
    fi
}

do_status() {
    if container_running; then
        if curl -fsS "http://127.0.0.1:${ONLYOFFICE_PORT}/healthcheck" >/dev/null 2>&1 \
           || curl -fsS "http://127.0.0.1:${ONLYOFFICE_PORT}/web-apps/apps/api/documents/api.js" >/dev/null 2>&1; then
            log_ok "OnlyOffice running (http://localhost:${ONLYOFFICE_PORT})"
        else
            log_warn "OnlyOffice container running but readiness check failed"
            return 1
        fi
    else
        log_fail "OnlyOffice container is not running"
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
  startup     Start OnlyOffice Document Server (Docker)
  shutdown    Stop OnlyOffice
  status      Check OnlyOffice status
  restart     Restart OnlyOffice
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
