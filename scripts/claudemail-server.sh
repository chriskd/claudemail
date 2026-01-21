#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${PID_FILE:-/tmp/claudemail-uvicorn.pid}"
LOG_FILE="${LOG_FILE:-/tmp/claudemail.log}"
PORT="${PORT:-8000}"
RELOAD="${RELOAD:-0}"
UV_BIN="${UV_BIN:-uv}"

usage() {
  cat <<EOF
Usage: $(basename "$0") <start|stop|restart|status>

Environment overrides:
  PORT       Port to bind (default: 8000)
  PID_FILE   PID file location (default: /tmp/claudemail-uvicorn.pid)
  LOG_FILE   Log file location (default: /tmp/claudemail.log)
  RELOAD     Set to 1 to enable --reload (default: 0)
  UV_BIN     Override uv binary path (default: uv)

Examples:
  PORT=8000 $(basename "$0") start
  RELOAD=1 $(basename "$0") start
  $(basename "$0") status
  $(basename "$0") stop
EOF
}

find_uvicorn_pid() {
  pgrep -f "uvicorn app.main:app" | tail -n 1
}

is_running() {
  local pid="$1"
  if [[ -z "${pid}" ]]; then
    return 1
  fi
  if ! ps -p "${pid}" >/dev/null 2>&1; then
    return 1
  fi
  local cmd
  cmd="$(ps -p "${pid}" -o cmd= | tr -d '\n' || true)"
  [[ "${cmd}" == *"uvicorn app.main:app"* ]]
}

start_server() {
  if [[ -f "${PID_FILE}" ]]; then
    local existing_pid
    existing_pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
    if is_running "${existing_pid}"; then
      echo "Server already running (pid ${existing_pid})."
      exit 0
    fi
  fi

  echo "Starting server on port ${PORT}..."
  cd "${ROOT_DIR}"
  local reload_flag=()
  if [[ "${RELOAD}" == "1" ]]; then
    reload_flag=(--reload)
  fi
  nohup env PYTHONPATH=src "${UV_BIN}" run python -m uvicorn app.main:app "${reload_flag[@]}" --host 0.0.0.0 --port "${PORT}" \
    >"${LOG_FILE}" 2>&1 &
  sleep 1.5
  local pid
  pid="$(find_uvicorn_pid || true)"
  if [[ -n "${pid}" ]] && is_running "${pid}"; then
    echo "${pid}" > "${PID_FILE}"
    echo "Server started (pid ${pid}). Logs: ${LOG_FILE}"
    exit 0
  fi

  echo "Server failed to start. Last 20 log lines:"
  tail -n 20 "${LOG_FILE}" || true
  exit 1
}

stop_server() {
  if [[ ! -f "${PID_FILE}" ]]; then
    local discovered
    discovered="$(find_uvicorn_pid || true)"
    if [[ -n "${discovered}" ]] && is_running "${discovered}"; then
      echo "Server running (pid ${discovered}) but PID file missing."
      echo "${discovered}" > "${PID_FILE}"
      exit 0
    fi
    echo "No PID file found; server not running?"
    exit 0
  fi
  local pid
  pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
  if ! is_running "${pid}"; then
    local discovered
    discovered="$(find_uvicorn_pid || true)"
    if [[ -n "${discovered}" ]] && is_running "${discovered}"; then
      pid="${discovered}"
      echo "PID file stale; stopping running server pid ${pid}."
    else
      echo "No running server found for pid ${pid}."
      rm -f "${PID_FILE}"
      exit 0
    fi
  fi

  echo "Stopping server (pid ${pid})..."
  kill "${pid}" >/dev/null 2>&1 || true

  for _ in {1..10}; do
    if ! is_running "${pid}"; then
      rm -f "${PID_FILE}"
      echo "Server stopped."
      exit 0
    fi
    sleep 0.5
  done

  echo "Server did not stop in time. Use: kill -9 ${pid}"
  exit 1
}

status_server() {
  if [[ -f "${PID_FILE}" ]]; then
    local pid
    pid="$(cat "${PID_FILE}" 2>/dev/null || true)"
    if is_running "${pid}"; then
      echo "Server running (pid ${pid}) on port ${PORT}."
      exit 0
    fi
    local discovered
    discovered="$(find_uvicorn_pid || true)"
    if [[ -n "${discovered}" ]] && is_running "${discovered}"; then
      echo "Server running (pid ${discovered}) on port ${PORT}."
      echo "${discovered}" > "${PID_FILE}"
      exit 0
    fi
    echo "PID file exists but server not running."
    exit 1
  fi
  local discovered
  discovered="$(find_uvicorn_pid || true)"
  if [[ -n "${discovered}" ]] && is_running "${discovered}"; then
    echo "Server running (pid ${discovered}) on port ${PORT}."
    echo "${discovered}" > "${PID_FILE}"
    exit 0
  fi
  echo "Server not running."
  exit 1
}

case "${1:-}" in
  start) start_server ;;
  stop) stop_server ;;
  restart) stop_server && start_server ;;
  status) status_server ;;
  -h|--help|"") usage; exit 0 ;;
  *) echo "Unknown command: ${1}"; usage; exit 1 ;;
esac
