#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: bash scripts/agent-run.sh <url> [agent-run options]" >&2
  exit 2
fi

if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
npx playwright install chromium
npm run build
node apps/cli/dist/index.js run --business-grade "$@"
