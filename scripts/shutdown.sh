#!/usr/bin/env bash
set -euo pipefail

GATEWAY_PORT="${GATEWAY_PORT:-3000}"
VITE_PORT="${VITE_PORT:-5173}"

# Also check common goosed ports
GOOSED_PORTS="3001 3002 3003 3004 3005"

GREEN='\033[0;32m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }

stop_port() {
    local port=$1
    local name=$2
    if lsof -ti:"${port}" >/dev/null 2>&1; then
        log_info "Stopping ${name} on port ${port}..."
        kill $(lsof -ti:"${port}") 2>/dev/null || true
        sleep 1
    fi
}

stop_port "${VITE_PORT}" "webapp"
stop_port "${GATEWAY_PORT}" "gateway"
for port in ${GOOSED_PORTS}; do
    stop_port "${port}" "goosed"
done

log_info "All services stopped"
