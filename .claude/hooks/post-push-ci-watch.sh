#!/usr/bin/env bash
# PostToolUse hook — monitors the CI/Deploy pipeline after git push.
# Blocks Claude until the run completes. Exits 1 on failure so Claude
# sees the errors and self-corrects before declaring the task done.

set -euo pipefail

# Parse tool input from stdin to determine whether this was a git push.
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
    print(d.get('tool_input', {}).get('command', ''))
except Exception:
    pass
" 2>/dev/null || true)

# Only act on git push commands.
if ! echo "$COMMAND" | grep -qE '^\s*git push'; then
  exit 0
fi

# Require gh CLI.
if ! command -v gh &>/dev/null; then
  echo "⚠️  gh CLI not found — pipeline monitoring skipped." >&2
  exit 0
fi

# Give GitHub a moment to register the run.
sleep 5

# Fetch the most recent run (covers both ci.yml on branch push and
# deploy.yml on tag push — whichever fired last is the relevant one).
RUN_ID=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null || echo "")
if [ -z "$RUN_ID" ] || [ "$RUN_ID" = "null" ]; then
  echo "⚠️  No pipeline run found — verify the push triggered a workflow." >&2
  exit 0
fi

RUN_NAME=$(gh run list --limit 1 --json name --jq '.[0].name' 2>/dev/null || echo "pipeline")
echo "🔍 Monitoring «${RUN_NAME}» (run ${RUN_ID})…"

# Watch with 10-minute hard timeout.
if timeout 600 gh run watch "$RUN_ID" --exit-status 2>&1; then
  echo "✅ Pipeline passed."
  exit 0
else
  echo ""
  echo "❌ Pipeline FAILED — read the errors below, fix them, then push again."
  echo "──────────────────────────────────────────────────────────────────────"
  gh run view "$RUN_ID" --log-failed 2>&1 || true
  echo "──────────────────────────────────────────────────────────────────────"
  exit 1
fi
