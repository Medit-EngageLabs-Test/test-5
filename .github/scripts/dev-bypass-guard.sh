#!/usr/bin/env bash
# Dev-bypass guard (AB#13584): blocks the temporary development bypass from reaching
# main or a release tag. The iam capability (.intelliflow/capabilities/iam.md)
# prescribes that every file touched by the bypass carries the literal marker
# INTELLIFLOW-DEV-BYPASS and that the bypass is removed once the Creator approves
# the collaudo, before the release starts. This guard enforces that removal
# mechanically: ci.yml runs it when the target is main, deploy.yml on release tags.
#
# Residual risk (accepted): a bypass whose files carry no marker is invisible to
# this guard. That would be a direct violation of an explicit capability rule —
# the realistic failure mode covered here is forgetting the removal, not hiding
# the bypass on purpose.
set -euo pipefail

# The files that legitimately document the marker (this script included) — the same
# exclusions as the capability's own compliance check.
# grep exits 0 (match), 1 (no match) or 2 (error). Only 1 is the clean case: an
# error must fail the guard, never pass it — a fail-open guard is the very thing
# this script exists to prevent.
GREP_STATUS=0
MATCHES=$(grep -rln "INTELLIFLOW-DEV-BYPASS" --exclude-dir={.git,node_modules} --exclude={iam.md,AGENT-CHECKLIST.md,release.md,dev-bypass-guard.sh} .) || GREP_STATUS=$?
if [ "$GREP_STATUS" -gt 1 ]; then
  echo "::error::dev-bypass guard could not scan the working tree (grep exit $GREP_STATUS)."
  exit "$GREP_STATUS"
fi

if [ -n "$MATCHES" ]; then
  echo "::error::INTELLIFLOW-DEV-BYPASS marker found — the development bypass must not reach main or a release tag."
  echo ""
  echo "Files still carrying the bypass:"
  echo "$MATCHES"
  echo ""
  echo "Remediation: remove the development bypass entirely — code, configuration and"
  echo "marker comments — as prescribed by the iam capability (.intelliflow/capabilities/iam.md,"
  echo "'Removal obligation'). The bypass is legitimate on development branches and during"
  echo "the collaudo, but must be gone once the Creator approves the collaudo and before"
  echo "the release starts. Never on main."
  exit 1
fi

echo "Dev-bypass guard: no INTELLIFLOW-DEV-BYPASS marker outside the documenting files."
