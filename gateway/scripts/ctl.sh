#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Gateway service control (includes goosed agent management)
#
# Usage: ./ctl.sh <action> [--background]
#   action: startup | shutdown | status | restart
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_DIR="$(dirname "${SCRIPT_DIR}")"

# --- Configuration (read from config.yaml) ---
yaml_val() {
    local key="$1" file="${SERVICE_DIR}/config.yaml"
    [ -f "${file}" ] || return 0
    node -e "const y=require('yaml');const f=require('fs').readFileSync('${file}','utf-8');const c=y.parse(f);const keys='${key}'.split('.');let v=c;for(const k of keys){v=v?.[k]};if(v!=null)process.stdout.write(String(v))" 2>/dev/null || true
}

GATEWAY_HOST="$(yaml_val server.host)"
GATEWAY_HOST="${GATEWAY_HOST:-0.0.0.0}"
GATEWAY_PORT="$(yaml_val server.port)"
GATEWAY_PORT="${GATEWAY_PORT:-3000}"
GATEWAY_SECRET_KEY="$(yaml_val server.secretKey)"
GATEWAY_SECRET_KEY="${GATEWAY_SECRET_KEY:-test}"

# --- Logging ---
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'
log_info()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
log_fail()  { echo -e "${RED}[FAIL]${NC}  $1"; }

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
    local name="$1" url="$2" headers="${3:-}" attempts="${4:-30}" delay="${5:-1}"
    for ((i=1; i<=attempts; i++)); do
        if [ -n "${headers}" ]; then
            curl -fsS "${url}" -H "${headers}" >/dev/null 2>&1 && return 0
        else
            curl -fsS "${url}" >/dev/null 2>&1 && return 0
        fi
        sleep "${delay}"
    done
    log_error "${name} health check failed: ${url}"
    return 1
}

gateway_url() {
    local sk="${GATEWAY_SECRET_KEY}"
    for host in "${GATEWAY_HOST}" "127.0.0.1"; do
        if curl -fsS "http://${host}:${GATEWAY_PORT}/status" -H "x-secret-key: ${sk}" >/dev/null 2>&1; then
            echo "http://${host}:${GATEWAY_PORT}"; return 0
        fi
    done
    for host in "${GATEWAY_HOST}" "127.0.0.1"; do
        local code
        code="$(curl -s -o /dev/null -w "%{http_code}" "http://${host}:${GATEWAY_PORT}/status" 2>/dev/null || true)"
        [ "${code}" = "401" ] && { echo "http://${host}:${GATEWAY_PORT}"; return 0; }
    done
    return 1
}

parse_agents_json() {
    node -e '
let d=""; process.stdin.on("data",c=>d+=c); process.stdin.on("end",()=>{
  try {
    const p=JSON.parse(d), a=Array.isArray(p.agents)?p.agents:[];
    const r=a.filter(x=>x&&x.status==="running");
    const b=a.filter(x=>x&&x.status!=="running");
    console.log(a.length+" "+r.length+" "+b.map(x=>x.id+":"+x.status).join(","));
  } catch { process.exit(2); }
});'
}

# --- Agents (goosed) helpers ---
shutdown_agents() {
    if pgrep -f goosed >/dev/null 2>&1; then
        log_info "Stopping goosed processes..."
        pkill -f goosed 2>/dev/null || true
        sleep 1
    fi
}

check_agents_configured() {
    local agents_json
    agents_json="$(curl -fsS "http://127.0.0.1:${GATEWAY_PORT}/agents" \
        -H "x-secret-key: ${GATEWAY_SECRET_KEY}" 2>/dev/null || true)"
    [ -z "${agents_json}" ] && { log_error "Failed to query agents"; return 1; }

    local summary
    summary="$(echo "${agents_json}" | parse_agents_json 2>/dev/null)" || true
    [ -z "${summary}" ] && { log_error "Failed to parse agents status"; return 1; }

    local total running bad
    read -r total running bad <<< "${summary}"

    if [ "${total}" -eq 0 ]; then
        log_error "No agents configured in gateway"
        return 1
    fi

    log_info "Agents configured (${total} total, instances spawn on demand)"
}

status_agents() {
    local base_url
    base_url="$(gateway_url 2>/dev/null)" || true

    if [ -n "${base_url}" ]; then
        local agents_json
        agents_json="$(curl -fsS "${base_url}/agents" -H "x-secret-key: ${GATEWAY_SECRET_KEY}" 2>/dev/null || true)"
        if [ -n "${agents_json}" ]; then
            local summary
            summary="$(echo "${agents_json}" | parse_agents_json 2>/dev/null)" || true
            if [ -n "${summary}" ]; then
                local total running bad
                read -r total running bad <<< "${summary}"
                if [ "${total}" -eq 0 ]; then
                    log_fail "No agents configured in gateway"
                    return 1
                else
                    log_ok "Agents configured (${total} total, ${running} with active instances)"
                fi
            else
                log_fail "Failed to parse /agents response"
                return 1
            fi
        else
            log_fail "Failed to query /agents"
            return 1
        fi
    else
        log_warn "Gateway unreachable — cannot check agents"
        return 1
    fi
}

# --- Gateway actions ---
GATEWAY_PID=""

do_startup() {
    local mode="${1:-foreground}"
    shutdown_agents
    stop_port "${GATEWAY_PORT}" "gateway"

    log_info "Starting gateway at http://${GATEWAY_HOST}:${GATEWAY_PORT}"
    cd "${SERVICE_DIR}"

    if [ "${mode}" = "background" ]; then
        npx tsx src/index.ts &
        GATEWAY_PID=$!
        if ! kill -0 "${GATEWAY_PID}" 2>/dev/null; then
            log_error "Failed to start gateway"
            return 1
        fi
        if ! wait_http_ok "Gateway" "http://127.0.0.1:${GATEWAY_PORT}/status" \
                "x-secret-key: ${GATEWAY_SECRET_KEY}" 40 1; then
            return 1
        fi
        log_info "Gateway started (PID: ${GATEWAY_PID})"
    else
        npx tsx src/index.ts
    fi
}

do_shutdown() {
    shutdown_agents
    stop_port "${GATEWAY_PORT}" "gateway"
}

do_status() {
    local has_fail=0
    if check_port "${GATEWAY_PORT}"; then
        if gateway_url >/dev/null 2>&1; then
            log_ok "Gateway running (http://localhost:${GATEWAY_PORT})"
        else
            log_fail "Gateway port open but /status check failed"
            has_fail=1
        fi
    else
        log_fail "Gateway not running on port ${GATEWAY_PORT}"
        has_fail=1
    fi
    status_agents || has_fail=1
    return "${has_fail}"
}

do_restart() {
    do_shutdown
    do_startup "${MODE}"
}

# --- Main ---
usage() {
    cat <<EOF
Usage: $(basename "$0") <action> [--background]

Actions:
  startup     Start gateway (and goosed agents on demand)
  shutdown    Stop gateway and all goosed processes
  status      Check gateway and agent status
  restart     Restart gateway
EOF
    exit 1
}

ACTION="${1:-}"
[ -z "${ACTION}" ] && usage
shift

MODE="foreground"
for arg in "$@"; do
    case "${arg}" in
        --background) MODE="background" ;;
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
