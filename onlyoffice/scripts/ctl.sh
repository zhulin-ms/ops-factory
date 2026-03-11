#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# OnlyOffice Document Server control (Docker Compose)
#
# Usage: ./ctl.sh <action>
#   action: startup | shutdown | status | restart
#
# Configuration source: config.yaml > default
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(dirname "${SCRIPT_DIR}")"

# --- Configuration ---
CONTAINER_NAME="onlyoffice"
COMPOSE_FILE="${SERVICE_DIR}/docker-compose.yml"

yaml_val() {
    local key="$1" file="${SERVICE_DIR}/config.yaml"
    [ -f "${file}" ] || return 0
    awk -F': ' -v k="${key}" '$1==k {print $2}' "${file}" | head -n1 | sed 's/^["'"'"']//;s/["'"'"']$//'
}

# --- Logging ---
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'
log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_fail()  { echo -e "${RED}[FAIL]${NC}  $1"; }

# --- Detect CA cert for HTTPS gateway trust ---
detect_ca_cert() {
    # 1. Gateway's exported cert PEM (auto-generated alongside keystore)
    local gateway_dir
    gateway_dir="$(dirname "${SERVICE_DIR}")/gateway"
    local gateway_pem="${gateway_dir}/.gateway-keystore.pem"
    if [ -f "${gateway_pem}" ]; then
        echo "${gateway_pem}"
        return 0
    fi
    # 2. mkcert command (if on PATH)
    if command -v mkcert >/dev/null 2>&1; then
        local ca_root
        ca_root="$(mkcert -CAROOT 2>/dev/null)"
        if [ -n "${ca_root}" ] && [ -f "${ca_root}/rootCA.pem" ]; then
            echo "${ca_root}/rootCA.pem"
            return 0
        fi
    fi
    # 3. Common mkcert CA locations by platform
    local candidates=()
    case "$(uname -s)" in
        Darwin)
            candidates+=("${HOME}/Library/Application Support/mkcert/rootCA.pem")
            ;;
        Linux)
            candidates+=("${HOME}/.local/share/mkcert/rootCA.pem")
            ;;
    esac
    for c in "${candidates[@]}"; do
        if [ -f "${c}" ]; then
            echo "${c}"
            return 0
        fi
    done
}

# --- Load config from config.yaml into env vars ---
load_config() {
    ONLYOFFICE_PORT="${ONLYOFFICE_PORT:-$(yaml_val port)}"
    ONLYOFFICE_PORT="${ONLYOFFICE_PORT:-8080}"

    export ONLYOFFICE_PORT
    export JWT_ENABLED="${JWT_ENABLED:-$(yaml_val jwtEnabled)}"
    export PLUGINS_ENABLED="${PLUGINS_ENABLED:-$(yaml_val pluginsEnabled)}"
    export ALLOW_PRIVATE_IP_ADDRESS="${ALLOW_PRIVATE_IP_ADDRESS:-$(yaml_val allowPrivateIpAddress)}"
    export ALLOW_META_IP_ADDRESS="${ALLOW_META_IP_ADDRESS:-$(yaml_val allowMetaIpAddress)}"

    [ -n "${JWT_ENABLED}" ] || JWT_ENABLED="false"
    [ -n "${PLUGINS_ENABLED}" ] || PLUGINS_ENABLED="false"
    [ -n "${ALLOW_PRIVATE_IP_ADDRESS}" ] || ALLOW_PRIVATE_IP_ADDRESS="true"
    [ -n "${ALLOW_META_IP_ADDRESS}" ] || ALLOW_META_IP_ADDRESS="true"

    # CA cert for HTTPS gateway trust
    # Priority: env var > config.yaml > auto-detect mkcert
    local ca_cert="${MKCERT_CA_CERT:-$(yaml_val caCert)}"
    if [ -z "${ca_cert}" ] || [ ! -f "${ca_cert}" ]; then
        ca_cert="$(detect_ca_cert)"
    fi
    if [ -n "${ca_cert}" ] && [ -f "${ca_cert}" ]; then
        export MKCERT_CA_CERT="${ca_cert}"
        export NODE_EXTRA_CA_CERTS="/usr/local/share/ca-certificates/custom-ca.crt"
    fi
}

# --- Utilities ---
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

# --- OnlyOffice actions ---
do_startup() {
    load_config

    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_info "OnlyOffice already running"
    else
        log_info "Starting OnlyOffice (port ${ONLYOFFICE_PORT})..."
        docker compose -f "${COMPOSE_FILE}" up -d
    fi

    # If CA cert is mounted, update container's CA trust store
    if [ -n "${MKCERT_CA_CERT:-}" ]; then
        docker exec "${CONTAINER_NAME}" update-ca-certificates >/dev/null 2>&1 || true
    fi

    log_info "Checking OnlyOffice readiness (timeout: 120s)..."
    if ! wait_ready 120 1; then
        log_warn "Not ready; recreating..."
        docker compose -f "${COMPOSE_FILE}" down
        docker compose -f "${COMPOSE_FILE}" up -d
        log_info "Re-checking readiness (timeout: 120s)..."
        if ! wait_ready 120 1; then
            log_error "OnlyOffice not ready after recreate"
            return 1
        fi
    fi
    log_info "OnlyOffice readiness check passed"
}

do_shutdown() {
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        log_info "Stopping OnlyOffice..."
        docker compose -f "${COMPOSE_FILE}" down
    fi
}

do_status() {
    load_config
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        local port="${ONLYOFFICE_PORT}"
        if curl -fsS "http://127.0.0.1:${port}/healthcheck" >/dev/null 2>&1 \
           || curl -fsS "http://127.0.0.1:${port}/web-apps/apps/api/documents/api.js" >/dev/null 2>&1; then
            log_ok "OnlyOffice running (http://localhost:${port})"
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
  startup     Start OnlyOffice Document Server (Docker Compose)
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
