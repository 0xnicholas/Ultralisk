#!/usr/bin/env bash
# Production-bundle sanity check: any text that should NEVER appear in
# a customer-facing build gets grep'd out of dist/. Fail loud if found.

set -euo pipefail

# This script lives in console-ui/scripts/; dist/ is at console-ui/dist/
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

if [ ! -d dist ]; then
  echo "postbuild-smoke: dist/ does not exist; skipping (run \`pnpm build\` first)" >&2
  exit 0
fi

failed=0

# Things that should be tree-shaken out of the production bundle.
forbidden=(
  "Dev Login"           # bypass button; only rendered in vite dev
  "debugger;"           # no leftover breakpoints (esbuild keeps these unless stripped)
  "TODO"                # unfinished work shipped to prod is bad
  "FIXME"               # ditto
)
# Note: we deliberately do NOT flag "console.log(" because model
# usage_examples.{python,typescript} include it as code shown to users
# (the print(...) / console.log(...) lines they are meant to copy-paste).
# If a real stray console.log ever slips into app code it will show up in
# a code review grep, not this smoke check.

for needle in "${forbidden[@]}"; do
  if grep -RInF "$needle" dist/assets/ >/dev/null 2>&1; then
    echo "FAIL: '$needle' found in dist/assets/" >&2
    grep -RInF "$needle" dist/assets/ | head -3 >&2
    failed=1
  fi
done

if [ "$failed" -eq 0 ]; then
  echo "postbuild-smoke: OK (no forbidden strings in dist/assets/)"
else
  echo "postbuild-smoke: FAILED" >&2
  exit 1
fi
