#!/usr/bin/env bash
# Stop then start console-api + console-ui. Anything passed to the script
# (e.g. env vars) is forwarded to dev-start.sh.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "[dev-restart] stopping..."
bash "$SCRIPT_DIR/dev-stop.sh" "$@"
echo
echo "[dev-restart] starting..."
bash "$SCRIPT_DIR/dev-start.sh" "$@"
