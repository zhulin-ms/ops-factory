#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  ops-factory  all-in-one service controller & watchdog
#  Usage:
#    ./ops-ctl.sh              # restart all + monitor
#    ./ops-ctl.sh start        # start all (no monitor)
#    ./ops-ctl.sh stop         # stop all
#    ./ops-ctl.sh status       # show status
#    ./ops-ctl.sh monitor      # monitor only (assume running)
# ============================================================

# ===================== config (edit here) =====================
BASE_DIR="/opt/ms/ops-factory"           # project root
LOG_DIR="${BASE_DIR}/logs"                # all logs output dir

GATEWAY_API_PASSWORD="ms@123"            # gateway API auth password
GATEWAY_PORT=3000                         # gateway service port
KNOWLEDGE_PORT=8092                       # knowledge-service port
WEBAPP_PORT=5173                          # webapp static server port

HEALTH_CHECK=true                         # true / false
HEALTH_HOST="127.0.0.1"                   # health check target IP
HEALTH_INTERVAL=30                        # seconds between checks
HEALTH_FAIL_THRESHOLD=3                   # consecutive failures before restart
STARTUP_WAIT=180                          # seconds to wait before first check
# ==============================================================

mkdir -p "${LOG_DIR}"

# ---------- colors ----------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'
ts()  { date '+%Y-%m-%d %H:%M:%S'; }
_log() { local lvl=$1; shift; echo -e "$lvl[$(ts)]${NC} $*" | tee -a "${LOG_DIR}/ops-ctl.log"; }
log_info()  { _log "${CYAN}[INFO]${NC}  " "$@"; }
log_ok()    { _log "${GREEN}[OK]${NC}    " "$@"; }
log_warn()  { _log "${YELLOW}[WARN]${NC}  " "$@"; }
log_error() { _log "${RED}[ERROR]${NC} " "$@"; }

# ---------- helpers ----------
export GATEWAY_API_PASSWORD

check_tcp() {
    local port=$1
    ss -tlnp 2>/dev/null | grep -q ":${port} " || nc -z 127.0.0.1 "${port}" 2>/dev/null
}

health_gateway() {
    curl -fsS -o /dev/null --max-time 5 "http://${HEALTH_HOST}:${GATEWAY_PORT}/gateway/status" 2>&1
}

health_knowledge() {
    curl -fsS -o /dev/null --max-time 5 "http://${HEALTH_HOST}:${KNOWLEDGE_PORT}/actuator/health" 2>&1
}

health_webapp() {
    curl -fsS -o /dev/null --max-time 5 "http://${HEALTH_HOST}:${WEBAPP_PORT}/" 2>&1
}

pids_of() {
    # match command line snippet, return space-separated PIDs
    pgrep -f "$1" 2>/dev/null || true
}

kill_pids() {
    # kill a space-separated list of PIDs with graceful → force fallback
    local label=$1; shift
    local pids="$*"
    [ -z "${pids}" ] && return 0
    log_warn "Stopping ${label}: PID ${pids}"
    kill ${pids} 2>/dev/null || true
    sleep 2
    local survivors=""
    for pid in ${pids}; do
        kill -0 "${pid}" 2>/dev/null && survivors="${survivors} ${pid}"
    done
    if [ -n "${survivors}" ]; then
        log_warn "Force-killing ${label}: PID ${survivors}"
        kill -9 ${survivors} 2>/dev/null || true
        sleep 1
    fi
    log_ok "${label} stopped"
}

kill_by_pattern() {
    local pattern=$1 label=$2
    local pids
    pids="$(pids_of "${pattern}")"
    if [ -n "${pids}" ]; then
        kill_pids "${label}" ${pids}
    else
        log_info "${label}: not running"
    fi
}

kill_goosed() {
    # goosed processes are spawned by gateway; find via ps -ef
    local pids
    pids="$(ps -ef | grep -v grep | grep 'goosed' | awk '{print $2}' | tr '\n' ' ' || true)"
    if [ -n "${pids}" ]; then
        kill_pids "goosed" ${pids}
    else
        log_info "goosed: not running"
    fi
}

# ---------- stop ----------
do_stop() {
    log_info "=== Stopping all services ==="
    kill_by_pattern "gateway-service\.jar"  "gateway-service"
    kill_goosed
    kill_by_pattern "knowledge-service\.jar" "knowledge-service"
    # python http.server on WEBAPP_PORT
    local web_pids
    web_pids="$(ss -tlnp 2>/dev/null | grep ":${WEBAPP_PORT} " | grep -oP 'pid=\K[0-9]+' || true)" || true
    if [ -n "${web_pids}" ]; then
        log_warn "Stopping webapp (port ${WEBAPP_PORT}): PID ${web_pids}"
        kill ${web_pids} 2>/dev/null || true
        sleep 1
    fi
    log_ok "All services stopped"
}

# ---------- start ----------
do_start() {
    log_info "=== Starting all services (BASE_DIR=${BASE_DIR}) ==="
    [ -d "${BASE_DIR}" ] || { log_error "BASE_DIR not found: ${BASE_DIR}"; exit 1; }

    # --- gateway ---
    local gw_dir="${BASE_DIR}/gateway"
    local gw_jar="${gw_dir}/gateway-service.jar"
    if [ -f "${gw_jar}" ]; then
        log_info "Starting gateway on port ${GATEWAY_PORT} ..."
        (
            cd "${gw_dir}"
            nohup java -Dloader.path=lib \
                -Dgateway.api.password="${GATEWAY_API_PASSWORD}" \
                -jar gateway-service.jar \
                --spring.config.location=config.yaml \
                --server.port="${GATEWAY_PORT}" \
                --gateway.cors-origin='*' \
                > "${LOG_DIR}/gateway.log" 2>&1 &
            echo $! > "${LOG_DIR}/gateway.pid"
        )
        log_ok "gateway started (PID $(cat "${LOG_DIR}/gateway.pid"))"
    else
        log_error "gateway jar not found: ${gw_jar}"
    fi

    # --- knowledge-service ---
    local ks_dir="${BASE_DIR}/knowledge-service"
    local ks_jar="${ks_dir}/target/knowledge-service.jar"
    if [ -f "${ks_jar}" ]; then
        log_info "Starting knowledge-service on port ${KNOWLEDGE_PORT} ..."
        (
            cd "${ks_dir}"
            nohup java -Dserver.port="${KNOWLEDGE_PORT}" \
                -jar target/knowledge-service.jar \
                > "${LOG_DIR}/knowledge-service.log" 2>&1 &
            echo $! > "${LOG_DIR}/knowledge-service.pid"
        )
        log_ok "knowledge-service started (PID $(cat "${LOG_DIR}/knowledge-service.pid"))"
    else
        log_error "knowledge-service jar not found: ${ks_jar}"
    fi

    # --- webapp ---
    local wa_dir="${BASE_DIR}/webapp"
    if [ -d "${wa_dir}" ]; then
        log_info "Starting webapp (static) on port ${WEBAPP_PORT} ..."
        (
            cd "${wa_dir}"
            nohup python3 -m http.server "${WEBAPP_PORT}" \
                > "${LOG_DIR}/webapp.log" 2>&1 &
            echo $! > "${LOG_DIR}/webapp.pid"
        )
        log_ok "webapp started (PID $(cat "${LOG_DIR}/webapp.pid"))"
    else
        log_error "webapp dir not found: ${wa_dir}"
    fi

    log_info "=== All start commands issued ==="
}

# ---------- status ----------
do_status() {
    if [ "${HEALTH_CHECK}" != "true" ]; then
        log_info "Health check disabled (HEALTH_CHECK=${HEALTH_CHECK}), skipping"
        return 0
    fi
    local rc=0
    echo ""
    if health_gateway; then
        log_ok "gateway         http://${HEALTH_HOST}:${GATEWAY_PORT}/gateway/status"
    else
        log_error "gateway         NOT healthy"
        rc=1
    fi

    if health_knowledge; then
        log_ok "knowledge       http://${HEALTH_HOST}:${KNOWLEDGE_PORT}/actuator/health"
    else
        log_error "knowledge       NOT healthy"
        rc=1
    fi

    if health_webapp; then
        log_ok "webapp           http://${HEALTH_HOST}:${WEBAPP_PORT}/"
    else
        log_error "webapp           NOT healthy"
        rc=1
    fi
    echo ""
    return ${rc}
}

# ---------- monitor ----------
do_monitor() {
    if [ "${HEALTH_CHECK}" != "true" ]; then
        log_info "Health monitor disabled (HEALTH_CHECK=${HEALTH_CHECK})"
        return 0
    fi

    log_info "Waiting ${STARTUP_WAIT}s for services to come up before monitoring ..."
    sleep "${STARTUP_WAIT}"

    local -A fail_count
    fail_count[gateway]=0
    fail_count[knowledge]=0
    fail_count[webapp]=0

    log_info "Health monitoring started (interval=${HEALTH_INTERVAL}s, threshold=${HEALTH_FAIL_THRESHOLD})"

    while true; do
        local now
        now="$(ts)"

        # --- gateway ---
        if health_gateway; then
            if [ "${fail_count[gateway]}" -gt 0 ]; then
                log_ok "gateway recovered (was ${fail_count[gateway]} failures)"
            fi
            fail_count[gateway]=0
        else
            fail_count[gateway]=$((fail_count[gateway] + 1))
            log_warn "gateway health FAIL [${fail_count[gateway]}/${HEALTH_FAIL_THRESHOLD}]"
            if [ "${fail_count[gateway]}" -ge "${HEALTH_FAIL_THRESHOLD}" ]; then
                log_error "gateway reached ${HEALTH_FAIL_THRESHOLD} consecutive failures — restarting"
                restart_service "gateway"
                fail_count[gateway]=0
            fi
        fi

        # --- knowledge ---
        if health_knowledge; then
            if [ "${fail_count[knowledge]}" -gt 0 ]; then
                log_ok "knowledge recovered (was ${fail_count[knowledge]} failures)"
            fi
            fail_count[knowledge]=0
        else
            fail_count[knowledge]=$((fail_count[knowledge] + 1))
            log_warn "knowledge health FAIL [${fail_count[knowledge]}/${HEALTH_FAIL_THRESHOLD}]"
            if [ "${fail_count[knowledge]}" -ge "${HEALTH_FAIL_THRESHOLD}" ]; then
                log_error "knowledge reached ${HEALTH_FAIL_THRESHOLD} consecutive failures — restarting"
                restart_service "knowledge"
                fail_count[knowledge]=0
            fi
        fi

        # --- webapp ---
        if health_webapp; then
            if [ "${fail_count[webapp]}" -gt 0 ]; then
                log_ok "webapp recovered (was ${fail_count[webapp]} failures)"
            fi
            fail_count[webapp]=0
        else
            fail_count[webapp]=$((fail_count[webapp] + 1))
            log_warn "webapp health FAIL [${fail_count[webapp]}/${HEALTH_FAIL_THRESHOLD}]"
            if [ "${fail_count[webapp]}" -ge "${HEALTH_FAIL_THRESHOLD}" ]; then
                log_error "webapp reached ${HEALTH_FAIL_THRESHOLD} consecutive failures — restarting"
                restart_service "webapp"
                fail_count[webapp]=0
            fi
        fi

        sleep "${HEALTH_INTERVAL}"
    done
}

restart_service() {
    local svc=$1
    case "${svc}" in
        gateway)
            kill_by_pattern "gateway-service\.jar" "gateway-service"
            sleep 2
            local gw_dir="${BASE_DIR}/gateway"
            (
                cd "${gw_dir}"
                nohup java -Dloader.path=lib \
                    -Dgateway.api.password="${GATEWAY_API_PASSWORD}" \
                    -jar gateway-service.jar \
                    --spring.config.location=config.yaml \
                    --server.port="${GATEWAY_PORT}" \
                    --gateway.cors-origin='*' \
                    >> "${LOG_DIR}/gateway.log" 2>&1 &
                echo $! > "${LOG_DIR}/gateway.pid"
            )
            log_ok "gateway restarted (PID $(cat "${LOG_DIR}/gateway.pid"))"
            ;;
        knowledge)
            kill_by_pattern "knowledge-service\.jar" "knowledge-service"
            sleep 2
            local ks_dir="${BASE_DIR}/knowledge-service"
            (
                cd "${ks_dir}"
                nohup java -Dserver.port="${KNOWLEDGE_PORT}" \
                    -jar target/knowledge-service.jar \
                    >> "${LOG_DIR}/knowledge-service.log" 2>&1 &
                echo $! > "${LOG_DIR}/knowledge-service.pid"
            )
            log_ok "knowledge restarted (PID $(cat "${LOG_DIR}/knowledge-service.pid"))"
            ;;
        webapp)
            local wa_dir="${BASE_DIR}/webapp"
            local old_pid
            old_pid="$(ss -tlnp 2>/dev/null | grep ":${WEBAPP_PORT} " | grep -oP 'pid=\K[0-9]+' || true)" || true
            [ -n "${old_pid}" ] && kill "${old_pid}" 2>/dev/null || true
            sleep 1
            (
                cd "${wa_dir}"
                nohup python3 -m http.server "${WEBAPP_PORT}" \
                    >> "${LOG_DIR}/webapp.log" 2>&1 &
                echo $! > "${LOG_DIR}/webapp.pid"
            )
            log_ok "webapp restarted (PID $(cat "${LOG_DIR}/webapp.pid"))"
            ;;
    esac
}

# ---------- main ----------
ACTION="${1:-start-monitor}"

case "${ACTION}" in
    start)
        do_stop
        do_start
        do_status
        ;;
    stop)
        do_stop
        ;;
    status)
        do_status
        ;;
    monitor)
        do_monitor
        ;;
    restart)
        do_stop
        do_start
        do_status
        do_monitor
        ;;
    start-monitor|"")
        do_stop
        do_start
        do_monitor
        ;;
    -h|--help|help)
        echo "Usage: $(basename "$0") {start|stop|status|monitor|restart}"
        echo ""
        echo "  (default)   stop → start → monitor with auto-restart"
        echo "  start       stop → start, no monitor"
        echo "  stop        stop all services"
        echo "  status      show health status"
        echo "  monitor     watchdog loop (auto-restart on ${HEALTH_FAIL_THRESHOLD}x failure)"
        echo "  restart     stop → start → monitor"
        echo ""
        echo "Config (edit script top):"
        echo "  BASE_DIR=${BASE_DIR}"
        echo "  HEALTH_CHECK=${HEALTH_CHECK}  HEALTH_HOST=${HEALTH_HOST}"
        echo "  GATEWAY_PORT=${GATEWAY_PORT}  KNOWLEDGE_PORT=${KNOWLEDGE_PORT}  WEBAPP_PORT=${WEBAPP_PORT}"
        echo "  HEALTH_INTERVAL=${HEALTH_INTERVAL}  HEALTH_FAIL_THRESHOLD=${HEALTH_FAIL_THRESHOLD}  STARTUP_WAIT=${STARTUP_WAIT}"
        ;;
    *)
        log_error "Unknown action: ${ACTION}"
        echo "Run '$(basename "$0") help' for usage."
        exit 1
        ;;
esac
