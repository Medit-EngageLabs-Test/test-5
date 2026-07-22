#!/usr/bin/env bash
# PreToolUse deny hook — blocks `git commit` while the current branch is
# main or an index/** branch.
#
# main only moves via merged pull requests; index branches only move via
# feature-branch merges performed by /pr. Committing directly on either
# would bypass the CI gate (docs/agents/workflow.md).
#
# Protocol: reads the tool-call JSON on stdin; exit 0 lets the call through,
# exit 2 denies it and feeds stderr back to the agent. The branch is read
# from the repository in the session's working directory, not from the
# command text.

set -eo pipefail
set -f

INPUT=$(cat)

COMMAND=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    d = json.loads(sys.stdin.read())
    if d.get('tool_name') == 'Bash':
        print(d.get('tool_input', {}).get('command', ''))
except Exception:
    pass
" 2>/dev/null || true)

[ -z "$COMMAND" ] && exit 0

# Does any shell segment of the (possibly compound) command invoke `git commit`?
has_commit=0
while IFS= read -r segment; do
  # shellcheck disable=SC2206
  tokens=($segment)
  git_seen=0
  for t in ${tokens[@]+"${tokens[@]}"}; do
    if [ "$t" = "git" ]; then
      git_seen=1
    elif [ $git_seen -eq 1 ] && [ "$t" = "commit" ]; then
      has_commit=1
    fi
  done
done < <(printf '%s\n' "$COMMAND" | tr '&;|' '\n')

[ $has_commit -eq 0 ] && exit 0

current=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
case "$current" in
  main)
    echo "BLOCKED by pre-commit-guard: the current branch is main." >&2
    echo "Commits land on feature branches only; main moves via merged pull requests (docs/agents/workflow.md)." >&2
    exit 2
    ;;
  index/*)
    echo "BLOCKED by pre-commit-guard: the current branch is '$current' (index branch)." >&2
    echo "Index branches only move via feature-branch merges performed by /pr; switch to a feature branch to commit." >&2
    exit 2
    ;;
esac

exit 0
