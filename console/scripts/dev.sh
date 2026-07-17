#!/usr/bin/env bash
# Single entry point that dispatches to start/stop/restart/clean/status/logs.
# Usage:
#   bash console/scripts/dev.sh start
#   bash console/scripts/dev.sh stop
#   bash console/scripts/dev.sh restart
#   bash console/scripts/dev.sh status
#   bash console/scripts/dev.sh logs [api|ui]
#   bash console/scripts/dev.sh clean        # kill zombies, leave nothing
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cmd="${1:-status}"
shift || true

case "$cmd" in
  start)   bash "$SCRIPT_DIR/dev-start.sh"   "$@" ;;
  stop)    bash "$SCRIPT_DIR/dev-stop.sh"    "$@" ;;
  restart) bash "$SCRIPT_DIR/dev-restart.sh" "$@" ;;
  clean)   bash "$SCRIPT_DIR/dev-clean.sh"   "$@" ;;
  status)
    echo "== ultralisk dev status =="
    for f in /tmp/ultralisk-api.pid /tmp/ultralisk-ui.pid; do
      if [ -f "$f" ]; then
        pid="$(cat "$f")"
        if kill -0 "$pid" 2>/dev/null; then
          echo "  $(basename "$f" .pid): pid $pid — running"
        else
          echo "  $(basename "$f" .pid): pid $pid — STALE"
        fi
      else
        echo "  $(basename "$f" .pid): not started"
      fi
    done
    echo
    echo "  api  port: $(lsof -ti:3100 2>/dev/null | head -1 || echo free)"
    echo "  ui   port: $(lsof -ti:5173 2>/dev/null | head -1 || echo free)"
    ;;
  logs)
    target="${1:-both}"
    if [ "$target" = "api" ] || [ "$target" = "both" ]; then
      echo ">> tailing /tmp/ultralisk-api.log (Ctrl-C to stop)"
      trap 'exit' INT TERM
      tail -n +1 -F /tmp/ultralisk-api.log &
      APITAIL=$!
    fi
    if [ "$target" = "ui" ] || [ "$target" = "both" ]; then
      [ "${APITAIL:-}" ] && wait $APITAIL 2>/dev/null || true
      echo ">> tailing /tmp/ultralisk-ui.log (Ctrl-C to stop)"
      tail -n +1 -F /tmp/ultralisk-ui.log
    fi
    ;;
  -h|--help|help)
    cat <<USAGE
Usage: dev.sh <command>

Commands:
  start    Launch console-api + console-ui in the background
  stop     SIGTERM (then SIGKILL after a grace period)
  restart  stop + start
  status   Show whether api/ui are running and their ports
  logs     Tail logs (api|ui|both). Default: both
  clean    Kill zombies and free :3100 / :5173 (nuclear option)

Log files: /tmp/ultralisk-api.log, /tmp/ultralisk-ui.log
Pid files: /tmp/ultralisk-api.pid, /tmp/ultralisk-ui.pid
USAGE
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    echo "Run 'bash console/scripts/dev.sh help' for usage." >&2
    exit 2
    ;;
esac
