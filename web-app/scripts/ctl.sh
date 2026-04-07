#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Web App service control
#
# Usage: ./ctl.sh <action> [--background]
#   action: startup | shutdown | status | restart
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(dirname "${SCRIPT_DIR}")"
ROOT_DIR="$(dirname "${SERVICE_DIR}")"

# --- Configuration (read from config.json) ---
config_val() {
    local key="$1" json_file="${SERVICE_DIR}/config.json"
    [ -f "${json_file}" ] || return 0
    node -e "const f=require('fs').readFileSync('${json_file}','utf-8');const c=JSON.parse(f);const keys='${key}'.split('.');let v=c;for(const k of keys){v=v?.[k]};if(v!=null)process.stdout.write(String(v))" 2>/dev/null || true
}

VITE_HOST="$(config_val host)"
VITE_HOST="${VITE_HOST:-0.0.0.0}"
VITE_PORT="$(config_val port)"
VITE_PORT="${VITE_PORT:-5173}"

# --- Logging ---
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'
log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_fail()  { echo -e "${RED}[FAIL]${NC}  $1"; }

LOG_DIR="${SERVICE_DIR}/logs"
PID_FILE="${LOG_DIR}/webapp.pid"
DAEMON_HELPER="${ROOT_DIR}/scripts/lib/service-daemon.sh"

# shellcheck source=/dev/null
source "${DAEMON_HELPER}"

# --- Utilities ---
check_port() { lsof -ti:"$1" >/dev/null 2>&1; }

stop_port() {
    local port=$1 name=$2
    if lsof -ti:"${port}" >/dev/null 2>&1; then
        log_info "Stopping ${name} on port ${port}..."
        kill $(lsof -ti:"${port}") 2>/dev/null || true
        sleep 1
    fi
}

wait_http_ok() {
    local name="$1" url="$2" attempts="${3:-30}" delay="${4:-1}"
    for ((i=1; i<=attempts; i++)); do
        curl -fsS "${url}" >/dev/null 2>&1 && return 0
        sleep "${delay}"
    done
    log_error "${name} health check failed: ${url}"
    return 1
}

# --- Webapp actions ---
WEBAPP_PID=""

do_startup() {
    local mode="${1:-foreground}"

    if [ "${mode}" = "background" ] && daemon_is_running "${PID_FILE}"; then
        local existing_pid
        existing_pid="$(daemon_read_pid "${PID_FILE}")"
        if curl -fsS "http://127.0.0.1:${VITE_PORT}" >/dev/null 2>&1; then
            log_info "Webapp already running (PID: ${existing_pid})"
            return 0
        fi
        log_warn "Managed webapp process exists but health check failed; restarting"
        daemon_stop "${PID_FILE}" "webapp" 5 || true
    fi

    if check_port "${VITE_PORT}" && ! daemon_is_running "${PID_FILE}"; then
        log_warn "Webapp port ${VITE_PORT} is occupied without a managed pidfile; using legacy port-based stop"
        stop_port "${VITE_PORT}" "webapp"
    fi

    log_info "Starting webapp at http://${VITE_HOST}:${VITE_PORT}"
    cd "${SERVICE_DIR}"

    local log_file="${LOG_DIR}/webapp.log"
    if [ "${mode}" = "background" ]; then
        WEBAPP_PID="$(daemon_start "${PID_FILE}" "${log_file}" npm run dev -- --host "${VITE_HOST}")"
    else
        npm run dev -- --host "${VITE_HOST}" &
        WEBAPP_PID=$!
    fi

    if ! kill -0 "${WEBAPP_PID}" 2>/dev/null; then
        log_error "Failed to start webapp"
        return 1
    fi

    if ! wait_http_ok "Webapp" "http://127.0.0.1:${VITE_PORT}" 120 1; then
        if [ "${mode}" = "background" ]; then
            daemon_stop "${PID_FILE}" "webapp" 5 || true
        fi
        return 1
    fi

    if [ "${mode}" = "background" ]; then
        log_info "Webapp ready at http://localhost:${VITE_PORT} (PID: ${WEBAPP_PID}, log: ${log_file})"
    else
        log_info "Webapp ready at http://localhost:${VITE_PORT}"
    fi

    if [ "${mode}" = "foreground" ]; then
        wait "${WEBAPP_PID}"
    fi
}

do_shutdown() {
    daemon_stop "${PID_FILE}" "webapp" 20 || true
    if ! daemon_wait_for_port_release "${VITE_PORT}" 20 0.1 && check_port "${VITE_PORT}" && ! daemon_is_running "${PID_FILE}"; then
        log_warn "Webapp port ${VITE_PORT} is occupied without a managed pidfile; using legacy port-based stop"
        stop_port "${VITE_PORT}" "webapp"
    fi
    rm -f "${PID_FILE}" 2>/dev/null || true
}

do_status() {
    if daemon_is_running "${PID_FILE}"; then
        local pid
        pid="$(daemon_read_pid "${PID_FILE}")"
        if curl -fsS "http://127.0.0.1:${VITE_PORT}" >/dev/null 2>&1; then
            log_ok "Webapp running (http://localhost:${VITE_PORT}, PID: ${pid})"
        else
            log_warn "Webapp process running (PID: ${pid}) but HTTP check failed"
            return 1
        fi
    elif check_port "${VITE_PORT}"; then
        log_warn "Webapp port open on ${VITE_PORT} but service is unmanaged (missing/stale pidfile)"
        return 1
    else
        log_fail "Webapp not running on port ${VITE_PORT}"
        return 1
    fi
}

do_restart() {
    do_shutdown
    do_startup "${MODE}"
}

# --- Main ---
usage() {
    cat <<EOF
Usage: $(basename "$0") <action> [--foreground|--background]

Actions:
  startup     Start webapp (Vite dev server)
  shutdown    Stop webapp
  status      Check webapp status
  restart     Restart webapp
EOF
    exit 1
}

ACTION="${1:-}"
[ -z "${ACTION}" ] && usage
shift

MODE="background"
for arg in "$@"; do
    case "${arg}" in
        --background) MODE="background" ;;
        --foreground) MODE="foreground" ;;
    esac
done

case "${ACTION}" in
    startup)  do_startup "${MODE}" ;;
    shutdown) do_shutdown ;;
    status)   do_status ;;
    restart)  do_restart ;;
    -h|--help|help) usage ;;
    *) log_error "Unknown action: ${ACTION}"; usage ;;
esac
