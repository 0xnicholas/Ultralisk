#!/usr/bin/env bash
# Stop console-api + console-ui. Sends SIGTERM first, then SIGKILL after a
# grace period if they don't exit. Idempotent — running with no servers is OK.
set -euo pipefail

API_PID_FILE="/tmp/ultralisk-api.pid"
UI_PID_FILE="/tmp/ultralisk-ui.pid"
GRACE_SECONDS="${GRACE_SECONDS:-5}"

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

stop_one() {
  local name="$1" pid_file="$2"
  if [ ! -f "$pid_file" ]; then
    echo "[dev-stop] $name: no pid file, skipping"
    return 0
  fi
  local pid
  pid="$(cat "$pid_file")"
  if ! kill -0 "$pid" 2>/dev/null; then
    yellow "[dev-stop] $name: pid $pid not running — clearing stale pid file"
    rm -f "$pid_file"
    return 0
  fi
  echo "[dev-stop] $name: sending SIGTERM to pid $pid"
  kill -TERM "$pid" 2>/dev/null || true

  local waited=0
  while [ "$waited" -lt "$GRACE_SECONDS" ]; do
    if ! kill -0 "$pid" 2>/dev/null; then
      green "[dev-stop] $name: exited cleanly"
      rm -f "$pid_file"
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done

  yellow "[dev-stop] $name: did not exit in ${GRACE_SECONDS}s — sending SIGKILL"
  kill -KILL "$pid" 2>/dev/null || true
  rm -f "$pid_file"
}

stop_one "console-api" "$API_PID_FILE"
stop_one "console-ui"  "$UI_PID_FILE"

echo
green "[dev-stop] done."
