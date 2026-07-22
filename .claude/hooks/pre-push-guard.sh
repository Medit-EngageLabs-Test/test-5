#!/usr/bin/env bash
# PreToolUse deny hook — blocks direct pushes to main from agent sessions.
#
# Branch protection is not available on the current GitHub tier (private
# repos, free plan), so enforcement lives agent-side: this hook is the
# compensating control mandated by the workflow (docs/agents/workflow.md).
#
# Protocol: reads the tool-call JSON on stdin; exit 0 lets the call through,
# exit 2 denies it and feeds stderr back to the agent.
#
# Matching is refspec-based, not textual: the destination ref of each push
# segment is resolved (explicit refspec, --delete target, or the current
# branch for a bare `git push`). Tag pushes (v*) always pass.

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

deny() {
  echo "BLOCKED by pre-push-guard: $1" >&2
  echo "Direct pushes to main are forbidden: main only moves via merged pull requests. Tag pushes (v*) are allowed." >&2
  exit 2
}

check_push_segment() {
  local seg="$1"
  # shellcheck disable=SC2206
  local tokens=($seg)
  local count=${#tokens[@]}
  [ "$count" -eq 0 ] && return 0

  # Locate `git … push` inside the segment (flags may sit between them).
  local i git_idx=-1 push_idx=-1
  for ((i = 0; i < count; i++)); do
    if [ "${tokens[$i]}" = "git" ] && [ $git_idx -lt 0 ]; then
      git_idx=$i
    elif [ $git_idx -ge 0 ] && [ "${tokens[$i]}" = "push" ]; then
      push_idx=$i
      break
    fi
  done
  [ $push_idx -lt 0 ] && return 0

  # Collect refspecs: positional args after the remote (first positional).
  local delete=0 tags_flag=0 positional=0
  local refspecs=""
  for ((i = push_idx + 1; i < count; i++)); do
    local a="${tokens[$i]}"
    case "$a" in
      --delete|-d) delete=1 ;;
      --tags) tags_flag=1 ;;
      -o|--push-option|--repo) i=$((i + 1)) ;;
      -*) ;;
      *)
        positional=$((positional + 1))
        if [ $positional -ge 2 ]; then
          refspecs="$refspecs $a"
        fi
        ;;
    esac
  done

  if [ -z "$refspecs" ]; then
    # `git push --tags` with no refspec only moves tags.
    [ $tags_flag -eq 1 ] && return 0
    # Bare `git push`: the destination is the current branch's upstream.
    local current
    current=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
    if [ "$current" = "main" ]; then
      deny "bare 'git push' while the current branch is main"
    fi
    return 0
  fi

  local r dst
  for r in $refspecs; do
    r="${r#+}"
    if [ $delete -eq 1 ]; then
      dst="$r"
    else
      dst="${r##*:}"
    fi
    case "$dst" in
      main|refs/heads/main)
        deny "push targets main (refspec: $r)"
        ;;
    esac
  done
  return 0
}

# Analyze every shell segment of a possibly compound command (&&, ;, |).
while IFS= read -r segment; do
  check_push_segment "$segment"
done < <(printf '%s\n' "$COMMAND" | tr '&;|' '\n')

exit 0
