#!/usr/bin/env bash
# Kill any zombie dev processes for the Ultralisk console monorepo.
# Safe to run at any time — it never touches unrelated processes.
set -euo pipefail

API_PORT="${PORT:-3100}"
UI_PORT="${VITE_PORT:-5173}"

red()    { printf '\033[31m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }

kill_by_port() {
  local port="$1"
  local label="$2"
  local pids
  pids="$(lsof -ti:"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    yellow "[dev-clean] Killing $label on :$port — PIDs: $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
    local remaining
    remaining="$(lsof -ti:"$port" 2>/dev/null || true)"
    if [ -n "$remaining" ]; then
      red "[dev-clean] Still bound to :$port — PIDs: $remaining (force kill)"
      echo "$remaining" | xargs kill -9 2>/dev/null || true
    fi
  else
    green "[dev-clean] :$port is free"
  fi
}

kill_by_pattern() {
  local pattern="$1"
  local pids
  pids="$(pgrep -f "$pattern" || true)"
  if [ -n "$pids" ]; then
    yellow "[dev-clean] Killing $pattern — PIDs: $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
}

kill_by_port "$API_PORT" "console-api"
kill_by_port "$UI_PORT"  "console-ui vite"

# Catch stragglers that aren't bound to a port but still hold DB connections / cron timers
kill_by_pattern "tsx watch src/index.ts"
kill_by_pattern "tsx.*src/index.ts"
kill_by_pattern "vite --port"
kill_by_pattern "Google Chrome.*remote-debugging-port" # only stray dev chrome instances

# Belt-and-braces wait so the OS releases the sockets
sleep 1

echo
green "[dev-clean] done. Try: cd console && pnpm dev"
