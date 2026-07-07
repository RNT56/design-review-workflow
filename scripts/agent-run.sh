#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: bash scripts/agent-run.sh <url> [agent-run options]" >&2
  exit 2
fi

setup_log="$(mktemp "${TMPDIR:-/tmp}/design-review-agent-setup.XXXXXX.log")"
trap 'rm -f "$setup_log"' EXIT

run_setup() {
  local label="$1"
  shift
  if ! "$@" >>"$setup_log" 2>&1; then
    trap - EXIT
    echo "Agent workflow setup failed during: $label" >&2
    echo "Setup log: $setup_log" >&2
    exit 1
  fi
}

if [ -f package-lock.json ]; then
  run_setup "npm ci" npm ci
else
  run_setup "npm install" npm install
fi
run_setup "playwright install chromium" npx playwright install chromium
run_setup "npm run build" npm run build
node apps/cli/dist/index.js run --business-grade --format json "$@"
