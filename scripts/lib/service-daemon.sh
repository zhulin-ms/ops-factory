#!/usr/bin/env bash

daemon_read_pid() {
    local pid_file="$1"
    [ -f "${pid_file}" ] || return 1

    local pid
    pid="$(tr -d '[:space:]' < "${pid_file}" 2>/dev/null)"
    [[ "${pid}" =~ ^[0-9]+$ ]] || return 1
    printf '%s' "${pid}"
}

daemon_is_running() {
    local pid_file="$1"
    local pid

    pid="$(daemon_read_pid "${pid_file}" 2>/dev/null)" || {
        rm -f "${pid_file}" 2>/dev/null || true
        return 1
    }

    if kill -0 "${pid}" 2>/dev/null; then
        return 0
    fi

    rm -f "${pid_file}" 2>/dev/null || true
    return 1
}

daemon_start() {
    local pid_file="$1"
    local log_file="$2"
    shift 2

    mkdir -p "$(dirname "${pid_file}")" "$(dirname "${log_file}")"

    local pid=""
    if command -v python3 >/dev/null 2>&1; then
        pid="$(python3 - "${log_file}" "$@" <<'PY'
import subprocess
import sys

log_path = sys.argv[1]
cmd = sys.argv[2:]

with open(log_path, "ab", buffering=0) as sink:
    proc = subprocess.Popen(
        cmd,
        stdin=subprocess.DEVNULL,
        stdout=sink,
        stderr=subprocess.STDOUT,
        start_new_session=True,
        close_fds=True,
    )

print(proc.pid)
PY
)"
    elif command -v setsid >/dev/null 2>&1; then
        nohup setsid "$@" </dev/null >>"${log_file}" 2>&1 &
        pid=$!
    else
        log_error "Detached startup requires python3 or setsid"
        return 1
    fi

    [[ "${pid}" =~ ^[0-9]+$ ]] || {
        log_error "Failed to capture daemon pid"
        return 1
    }

    printf '%s\n' "${pid}" > "${pid_file}"

    if ! kill -0 "${pid}" 2>/dev/null; then
        rm -f "${pid_file}" 2>/dev/null || true
        log_error "Daemon exited before startup completed"
        return 1
    fi

    printf '%s\n' "${pid}"
}

daemon_stop() {
    local pid_file="$1"
    local name="$2"
    local timeout_secs="${3:-20}"
    local pid

    pid="$(daemon_read_pid "${pid_file}" 2>/dev/null)" || {
        rm -f "${pid_file}" 2>/dev/null || true
        return 1
    }

    if ! kill -0 "${pid}" 2>/dev/null; then
        rm -f "${pid_file}" 2>/dev/null || true
        return 1
    fi

    log_info "Stopping ${name} (PID: ${pid})..."
    kill "${pid}" 2>/dev/null || true

    local attempt
    local max_attempts=$(( timeout_secs * 10 ))
    for ((attempt=0; attempt<max_attempts; attempt++)); do
        if ! kill -0 "${pid}" 2>/dev/null; then
            rm -f "${pid_file}" 2>/dev/null || true
            return 0
        fi
        sleep 0.1
    done

    log_warn "${name} did not stop after ${timeout_secs}s, sending SIGKILL"
    kill -9 "${pid}" 2>/dev/null || true

    for ((attempt=0; attempt<20; attempt++)); do
        if ! kill -0 "${pid}" 2>/dev/null; then
            rm -f "${pid_file}" 2>/dev/null || true
            return 0
        fi
        sleep 0.1
    done

    log_error "Failed to stop ${name} cleanly"
    return 1
}

daemon_wait_for_port_release() {
    local port="$1"
    local attempts="${2:-20}"
    local delay="${3:-0.1}"
    local attempt

    for ((attempt=0; attempt<attempts; attempt++)); do
        if ! lsof -ti:"${port}" >/dev/null 2>&1; then
            return 0
        fi
        sleep "${delay}"
    done

    return 1
}
