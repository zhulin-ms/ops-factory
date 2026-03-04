#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# ops-factory unified service orchestrator
#
# Usage: ./ctl.sh <action> [component]
#
#   action:    startup | shutdown | status | restart
#   component: onlyoffice | langfuse | gateway | exporter | webapp | all (default)
#
# Examples:
#   ./ctl.sh startup            # start all services
#   ./ctl.sh shutdown webapp    # stop webapp only
#   ./ctl.sh status             # check all services
#   ./ctl.sh restart gateway    # restart gateway
#
# Service toggles (env vars):
#   ENABLE_ONLYOFFICE=false ./ctl.sh startup   # skip OnlyOffice
#   ENABLE_LANGFUSE=false   ./ctl.sh startup   # skip Langfuse
#   ENABLE_EXPORTER=false   ./ctl.sh startup   # skip Exporter
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "${SCRIPT_DIR}")"

# === Service toggles (optional services, set to false to skip) ===
ENABLE_ONLYOFFICE="${ENABLE_ONLYOFFICE:-true}"
ENABLE_LANGFUSE="${ENABLE_LANGFUSE:-true}"
ENABLE_EXPORTER="${ENABLE_EXPORTER:-true}"
# gateway and webapp are mandatory — no toggles

# === Configuration (passed to sub-scripts via env) ===
export GATEWAY_HOST="${GATEWAY_HOST:-0.0.0.0}"
export GATEWAY_PORT="${GATEWAY_PORT:-3000}"
export GATEWAY_SECRET_KEY="${GATEWAY_SECRET_KEY:-test}"
export GOOSED_BIN="${GOOSED_BIN:-${ROOT_DIR}/gateway/goosed}"
export PROJECT_ROOT="${ROOT_DIR}"
export VITE_PORT="${VITE_PORT:-5173}"
export ONLYOFFICE_PORT="${ONLYOFFICE_PORT:-8080}"
export LANGFUSE_PORT="${LANGFUSE_PORT:-3100}"
export EXPORTER_PORT="${EXPORTER_PORT:-9091}"
export GATEWAY_URL="http://127.0.0.1:${GATEWAY_PORT}"

[ -n "${OFFICE_PREVIEW_ENABLED:-}" ] && export OFFICE_PREVIEW_ENABLED
[ -n "${ONLYOFFICE_URL:-}" ]         && export ONLYOFFICE_URL
[ -n "${ONLYOFFICE_FILE_BASE_URL:-}" ] && export ONLYOFFICE_FILE_BASE_URL

# === Sub-script paths ===
CTL_GATEWAY="${ROOT_DIR}/gateway/scripts/ctl.sh"
CTL_WEBAPP="${ROOT_DIR}/web-app/scripts/ctl.sh"
CTL_LANGFUSE="${ROOT_DIR}/langfuse/scripts/ctl.sh"
CTL_ONLYOFFICE="${ROOT_DIR}/onlyoffice/scripts/ctl.sh"
CTL_EXPORTER="${ROOT_DIR}/prometheus-exporter/scripts/ctl.sh"

# === Logging ===
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'
log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_fail()  { echo -e "${RED}[FAIL]${NC}  $1"; }

# === Helpers ===
run_if_enabled() {
    local toggle="$1" name="$2" script="$3"
    shift 3
    if [ "${toggle}" = "true" ]; then
        "${script}" "$@"
    else
        log_info "${name} disabled (toggle=false)"
    fi
}

# === Cleanup trap for background processes ===
GATEWAY_BG_PID=""
EXPORTER_BG_PID=""
WEBAPP_BG_PID=""

cleanup() {
    for pid_var in WEBAPP_BG_PID EXPORTER_BG_PID GATEWAY_BG_PID; do
        local pid="${!pid_var}"
        if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
            kill "${pid}" 2>/dev/null || true
            wait "${pid}" 2>/dev/null || true
        fi
    done
}

# === Orchestration ===
do_startup() {
    local component="${1:-all}"

    case "${component}" in
        all)
            # Shutdown everything first
            do_shutdown all

            log_info "Starting all services..."
            trap cleanup EXIT INT TERM

            # 1. OnlyOffice (optional)
            run_if_enabled "${ENABLE_ONLYOFFICE}" "OnlyOffice" "${CTL_ONLYOFFICE}" startup

            # 2. Langfuse (optional)
            run_if_enabled "${ENABLE_LANGFUSE}" "Langfuse" "${CTL_LANGFUSE}" startup

            # 3. Gateway (mandatory, background)
            "${CTL_GATEWAY}" startup --background

            # 4. Exporter (optional, background)
            run_if_enabled "${ENABLE_EXPORTER}" "Exporter" "${CTL_EXPORTER}" startup --background

            # 5. Webapp (mandatory, foreground — blocking)
            "${CTL_WEBAPP}" startup
            ;;
        onlyoffice) "${CTL_ONLYOFFICE}" startup ;;
        langfuse)   "${CTL_LANGFUSE}" startup ;;
        gateway)    "${CTL_GATEWAY}" startup ;;
        exporter)   "${CTL_EXPORTER}" startup ;;
        webapp)     "${CTL_WEBAPP}" startup ;;
        *) usage ;;
    esac
}

do_shutdown() {
    local component="${1:-all}"

    case "${component}" in
        all)
            "${CTL_EXPORTER}" shutdown
            "${CTL_WEBAPP}" shutdown
            "${CTL_GATEWAY}" shutdown
            "${CTL_LANGFUSE}" shutdown
            "${CTL_ONLYOFFICE}" shutdown
            log_info "All services stopped"
            ;;
        onlyoffice) "${CTL_ONLYOFFICE}" shutdown ;;
        langfuse)   "${CTL_LANGFUSE}" shutdown ;;
        gateway)    "${CTL_GATEWAY}" shutdown ;;
        exporter)   "${CTL_EXPORTER}" shutdown ;;
        webapp)     "${CTL_WEBAPP}" shutdown ;;
        *) usage ;;
    esac
}

do_status() {
    local component="${1:-all}"
    local has_fail=0

    echo "Service status:"
    echo "--------------"

    case "${component}" in
        all)
            if [ "${ENABLE_ONLYOFFICE}" = "true" ]; then
                "${CTL_ONLYOFFICE}" status || has_fail=1
            fi
            if [ "${ENABLE_LANGFUSE}" = "true" ]; then
                "${CTL_LANGFUSE}" status || has_fail=1
            fi
            "${CTL_GATEWAY}" status || has_fail=1
            if [ "${ENABLE_EXPORTER}" = "true" ]; then
                "${CTL_EXPORTER}" status || has_fail=1
            fi
            "${CTL_WEBAPP}" status || has_fail=1
            echo
            if [ "${has_fail}" -eq 0 ]; then
                log_ok "All services are up"
            else
                log_fail "One or more services are down"
            fi
            ;;
        onlyoffice) "${CTL_ONLYOFFICE}" status || has_fail=1 ;;
        langfuse)   "${CTL_LANGFUSE}" status   || has_fail=1 ;;
        gateway)    "${CTL_GATEWAY}" status     || has_fail=1 ;;
        exporter)   "${CTL_EXPORTER}" status    || has_fail=1 ;;
        webapp)     "${CTL_WEBAPP}" status      || has_fail=1 ;;
        *) usage ;;
    esac

    return "${has_fail}"
}

do_restart() {
    local component="${1:-all}"
    do_shutdown "${component}"
    do_startup "${component}"
}

# === Usage & Main ===
usage() {
    cat <<'EOF'
Usage: ctl.sh <action> [component]

Actions:
  startup     Start service(s)
  shutdown    Stop service(s)
  status      Check service status
  restart     Restart service(s)

Components:
  all         All services (default)
  onlyoffice  OnlyOffice Document Server (Docker)     [optional]
  langfuse    Langfuse observability platform (Docker) [optional]
  gateway     Gateway + goosed agents                  [mandatory]
  exporter    Prometheus metrics exporter              [optional]
  webapp      Web application (Vite dev server)        [mandatory]

Service toggles (env vars):
  ENABLE_ONLYOFFICE=true|false  (default: true)
  ENABLE_LANGFUSE=true|false    (default: true)
  ENABLE_EXPORTER=true|false    (default: true)
EOF
    exit 1
}

ACTION="${1:-}"
COMPONENT="${2:-all}"

[ -z "${ACTION}" ] && usage

case "${ACTION}" in
    startup)  do_startup  "${COMPONENT}" ;;
    shutdown) do_shutdown "${COMPONENT}" ;;
    status)   do_status   "${COMPONENT}" ;;
    restart)  do_restart  "${COMPONENT}" ;;
    -h|--help|help) usage ;;
    *) log_error "Unknown action: ${ACTION}"; usage ;;
esac
