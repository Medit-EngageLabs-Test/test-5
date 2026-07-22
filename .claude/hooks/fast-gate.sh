#!/usr/bin/env bash
# PreToolUse hook — local fast-gate (AB#13713 / Feature #13706).
#
# Prima di un `git push` di un branch, esegue in LOCALE il sotto-insieme veloce
# dei check della CI, SOLO sul lato toccato dal diff:
#   - backend (.NET):   dotnet format --verify-no-changes && build && test
#   - frontend (Angular): npm run format:check && ng lint
# Così i giri di CI rossi — e la costosa rilettura dei loro log nel thread — non
# entrano nel percorso critico né nel budget del run. È ADDITIVO: la CI verde
# prima del merge resta il gate primario.
#
# Skip (exit 0): comando non-push; push di soli tag; diff di sola documentazione
# (nessun file di codice toccato); repository template (marker .template-repo).
#
# Testabilità: FAST_GATE_DRY_RUN=1 stampa il piano ed esce 0 senza eseguire nulla;
# FAST_GATE_BACKEND_CMD / FAST_GATE_FRONTEND_CMD sostituiscono i comandi di check.
#
# Protocol: legge il JSON della tool-call su stdin; exit 0 = passa, exit 2 = blocca.

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

# Fast path: no `push` word anywhere means no push segment can exist.
case "$COMMAND" in
*push*) ;;
*) exit 0 ;;
esac

# True when the shell segment invokes the `push` git SUBCOMMAND (not `git stash
# push`, not `git log --grep push`). Same parse as pre-push-token-gate.
segment_has_push() {
  local seg="$1"
  # shellcheck disable=SC2206
  local tokens=($seg)
  local count=${#tokens[@]}
  local i git_seen=0
  for ((i = 0; i < count; i++)); do
    local token="${tokens[$i]}"
    if [ $git_seen -eq 0 ]; then
      [ "$token" = "git" ] && git_seen=1
      continue
    fi
    case "$token" in
    -C | -c | --git-dir | --work-tree | --exec-path | --namespace) i=$((i + 1)) ;;
    -*) ;;
    push) return 0 ;;
    *) git_seen=0 ;;
    esac
  done
  return 1
}

HAS_PUSH=0
while IFS= read -r segment; do
  if segment_has_push "$segment"; then
    HAS_PUSH=1
    break
  fi
done < <(printf '%s\n' "$COMMAND" | tr '&;|' '\n')

[ $HAS_PUSH -eq 0 ] && exit 0

# A pure tag push carries no source diff to gate.
case "$COMMAND" in
*--tags*) exit 0 ;;
esac

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
[ -z "$REPO_ROOT" ] && exit 0

# The template repository itself is validated by template-ci.yml, not by this hook.
[ -e "$REPO_ROOT/.template-repo" ] && exit 0
cd "$REPO_ROOT"

# Base for the diff: the branch point against main (origin/main preferred).
BASE=""
for ref in origin/main main; do
  if git rev-parse --verify --quiet "$ref" >/dev/null 2>&1; then
    BASE="$ref"
    break
  fi
done
[ -z "$BASE" ] && exit 0 # cannot determine scope: don't block

CHANGED=$(git diff --name-only "$BASE"...HEAD 2>/dev/null || true)
[ -z "$CHANGED" ] && exit 0

backend=0
frontend=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  case "$f" in
  *.cs | *.csproj | *.sln) backend=1 ;;
  App/frontend/*)
    case "$f" in
    *.ts | *.html | *.css | *.scss | */package.json | */angular.json) frontend=1 ;;
    esac
    ;;
  esac
done <<<"$CHANGED"

# Doc-only (or config-only) diff: nothing for the fast-gate to run.
[ $backend -eq 0 ] && [ $frontend -eq 0 ] && exit 0

if [ "${FAST_GATE_DRY_RUN:-0}" = "1" ]; then
  plan=""
  [ $backend -eq 1 ] && plan="backend"
  [ $frontend -eq 1 ] && plan="${plan:+$plan,}frontend"
  echo "fast-gate: would run [$plan]"
  exit 0
fi

fail=0
report=""
run_side() { # run_side <name> <command>
  local name="$1" cmd="$2"
  if ! bash -c "$cmd" >"/tmp/fast-gate-$name.log" 2>&1; then
    fail=1
    report="$report
- $name: FAIL"
  fi
}

[ $backend -eq 1 ] && run_side backend "${FAST_GATE_BACKEND_CMD:-dotnet format --verify-no-changes && dotnet build && dotnet test}"
[ $frontend -eq 1 ] && run_side frontend "${FAST_GATE_FRONTEND_CMD:-cd App/frontend && npm run format:check && npx ng lint}"

if [ $fail -ne 0 ]; then
  echo "BLOCKED by fast-gate: check locali falliti prima del push.$report" >&2
  echo "Correggi i fallimenti (format/build/test/lint) e ripusha: eviti un giro di CI rosso e la rilettura dei suoi log. Log per lato in /tmp/fast-gate-*.log." >&2
  exit 2
fi

echo "fast-gate: OK"
exit 0
