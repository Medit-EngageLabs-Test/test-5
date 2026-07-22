#!/usr/bin/env bash
# settings-defaults-guard (AB#13709 / Feature #13706)
#
# Verifica che il .claude/settings.json del template porti i default "sani" del
# run autonomo, così che un run non parta per sbaglio su una combinazione costosa
# come nella demo (Fable @ xhigh):
#   - model:        presente e NON-Fable (su Fable il thinking è obbligatorio,
#                   abbassare l'effort non riduce il pensiero);
#   - effortLevel:  presente e CONTENUTO (mai "xhigh");
#   - advisorModel: presente (advisor abilitato come escalation on-demand).
#
# Default MORBIDO: il Creator può alzare l'effort o cambiare modello e se ne
# assume la responsabilità. Perciò è vietato l'enforcement DURO via env var
# (CLAUDE_CODE_EFFORT_LEVEL / ANTHROPIC_MODEL nel devcontainer): sarebbe globale
# e clamperebbe anche i subagent, chiudendo il routing per fase.
set -euo pipefail

SETTINGS="${1:-.claude/settings.json}"
fail=0
err() {
  echo "settings-defaults-guard: $1" >&2
  fail=1
}

if [ ! -f "$SETTINGS" ]; then
  echo "settings-defaults-guard: $SETTINGS non trovato" >&2
  exit 1
fi

model=$(jq -r '.model // empty' "$SETTINGS")
effort=$(jq -r '.effortLevel // empty' "$SETTINGS")
advisor=$(jq -r '.advisorModel // empty' "$SETTINGS")

[ -n "$model" ] || err "manca la chiave 'model' (default di modello non impostato)"
case "$(printf '%s' "$model" | tr '[:upper:]' '[:lower:]')" in
*fable*) err "'model' non deve essere Fable (thinking obbligatorio): '$model'" ;;
esac

[ -n "$effort" ] || err "manca la chiave 'effortLevel' (default di effort non impostato)"
[ "$effort" = "xhigh" ] && err "'effortLevel' non deve essere 'xhigh': il default va tenuto contenuto"

[ -n "$advisor" ] || err "manca la chiave 'advisorModel' (advisor non abilitato di default)"

# Default morbido: nessun enforcement duro via env var nel devcontainer.
if [ -f .devcontainer/devcontainer.json ] &&
  grep -qE 'CLAUDE_CODE_EFFORT_LEVEL|ANTHROPIC_MODEL' .devcontainer/devcontainer.json; then
  err "enforcement duro via env var (CLAUDE_CODE_EFFORT_LEVEL/ANTHROPIC_MODEL) non ammesso: il default è morbido"
fi

if [ "$fail" -ne 0 ]; then
  echo "settings-defaults-guard: FAIL" >&2
  exit 1
fi
echo "settings-defaults-guard: OK (model=$model effortLevel=$effort advisorModel=$advisor)"
