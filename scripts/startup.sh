#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "${SCRIPT_DIR}")"
WEB_DIR="${ROOT_DIR}/web-app"
GATEWAY_DIR="${ROOT_DIR}/gateway"

# Configuration (all have defaults)
export GATEWAY_HOST="${GATEWAY_HOST:-127.0.0.1}"
export GATEWAY_PORT="${GATEWAY_PORT:-3000}"
export GATEWAY_SECRET_KEY="${GATEWAY_SECRET_KEY:-test}"
export GOOSED_BIN="${GOOSED_BIN:-goosed}"
export PROJECT_ROOT="${ROOT_DIR}"
VITE_PORT="${VITE_PORT:-5173}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

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

# 2. Start gateway (which spawns all goosed instances)
log_info "Starting gateway at http://${GATEWAY_HOST}:${GATEWAY_PORT}"
cd "${GATEWAY_DIR}"
npx tsx src/index.ts &
GATEWAY_PID=$!

# Wait for gateway to be ready
sleep 5
if ! kill -0 "${GATEWAY_PID}" 2>/dev/null; then
    log_error "Failed to start gateway"
    exit 1
fi
log_info "Gateway started (PID: ${GATEWAY_PID})"

# 3. Start webapp
log_info "Starting webapp at http://${GATEWAY_HOST}:${VITE_PORT}"
cd "${WEB_DIR}"
npm run dev -- --host "${GATEWAY_HOST}"
