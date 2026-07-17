#!/usr/bin/env bash
# Start console-api (:3100) and console-ui (:5173) in the background.
# Idempotent — exits 0 with a warning if both are already up.
# Logs: /tmp/ultralisk-api.log, /tmp/ultralisk-ui.log
# PIDs : /tmp/ultralisk-api.pid, /tmp/ultralisk-ui.pid
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONSOLE_ROOT="$REPO_ROOT/console"
API_DIR="$CONSOLE_ROOT/console-api"
UI_DIR="$CONSOLE_ROOT/console-ui"

API_PORT="${PORT:-3100}"
UI_PORT="${VITE_PORT:-5173}"

API_LOG="/tmp/ultralisk-api.log"
UI_LOG="/tmp/ultralisk-ui.log"
API_PID_FILE="/tmp/ultralisk-api.pid"
UI_PID_FILE="/tmp/ultralisk-ui.pid"

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
blue()   { printf '\033[34m%s\033[0m\n' "$*"; }

is_running() {
  local pid_file="$1"
  [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" 2>/dev/null
}

port_in_use() {
  lsof -ti:"$1" 2>/dev/null | head -1
}

wait_for_port() {
  local port="$1" name="$2" pid_file="$3" tries=40
  while [ "$tries" -gt 0 ]; do
    if ! is_running "$pid_file"; then
      red "[dev-start] $name process died during startup. See $4"
      return 1
    fi
    if port_in_use "$port" >/dev/null; then
      green "[dev-start] $name listening on :$port"
      return 0
    fi
    sleep 0.5
    tries=$((tries - 1))
  done
  red "[dev-start] $name did not start on :$port after 20s. See $4"
  return 1
}

start_one() {
  local name="$1" dir="$2" cmd="$3" log="$4" pid_file="$5" port="$6"
  shift 6
  # Remaining args are KEY=VALUE env pairs to set before launch.

  if is_running "$pid_file"; then
    yellow "[dev-start] $name already running (pid $(cat "$pid_file"), log: $log)"
    return 0
  fi
  if [ -n "$(port_in_use "$port")" ]; then
    local other
    other="$(port_in_use "$port")"
    yellow "[dev-start] $name port :$port is held by pid $other — left it alone"
    echo "$other" > "$pid_file"
    return 0
  fi

  blue "[dev-start] launching $name (log: $log)"
  : > "$log"
  (
    cd "$dir"
    # Pass KEY=VALUE pairs as real env to the child, so the parent shell's
    # leaked env (DATABASE_URL, etc.) does not override them.
    env "$@" nohup bash -c "$cmd" >> "$log" 2>&1 &
  )
  # Capture the actual port-owning PID (pnpm/npx spawn a child; $! races with that)
  local tries=40
  while [ "$tries" -gt 0 ]; do
    local real_pid
    real_pid="$(port_in_use "$port" || true)"
    if [ -n "$real_pid" ]; then
      echo "$real_pid" > "$pid_file"
      break
    fi
    sleep 0.25
    tries=$((tries - 1))
  done
  wait_for_port "$port" "$name" "$pid_file" "$log"
}

# --- API ---------------------------------------------------------------------
# We always pin DATABASE_URL to the local ultralisk_console database. We
# deliberately do NOT inherit it from the parent shell — users typically
# have unrelated DATABASE_URL set (e.g. for a sibling project on a different
# port) that would silently route the API at the wrong schema.
start_one "console-api" "$API_DIR" "pnpm dev" "$API_LOG" "$API_PID_FILE" "$API_PORT" \
  "DATABASE_URL=postgres://postgres:postgres@localhost:5432/ultralisk_console" \
  "JWT_SECRET=${JWT_SECRET:-dev-secret-change-in-production}" \
  "DEPLOYMENT_MODE=${DEPLOYMENT_MODE:-saas}"

# --- UI ----------------------------------------------------------------------
start_one "console-ui" "$UI_DIR" "pnpm dev" "$UI_LOG" "$UI_PID_FILE" "$UI_PORT" \
  "DEPLOYMENT_MODE=${DEPLOYMENT_MODE:-saas}"

echo
green "[dev-start] up."
echo "  API:  http://localhost:$API_PORT  (pid $(cat "$API_PID_FILE" 2>/dev/null || echo '?')) — tail: tail -f $API_LOG"
echo "  UI:   http://localhost:$UI_PORT  (pid $(cat "$UI_PID_FILE" 2>/dev/null || echo '?')) — tail: tail -f $UI_LOG"
echo
echo "Stop with:  bash console/scripts/dev-stop.sh"
