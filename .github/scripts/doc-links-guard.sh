#!/usr/bin/env bash
# Documentation link guard: fails if a relative Markdown link in a tracked .md
# file points at a path that does not exist. It keeps the agent-facing docs
# honest — an agent reads them cold each session, and a moved or renamed file
# must not leave a dangling pointer for it to follow. Ported from the portal's
# link-check (agent-friendliness, PR #77 / AB#13661), scoped to what ships in the
# Template Bundle so every instantiated App inherits the same guarantee:
# ci.yml runs it on every App PR and on main.
#
# Scope: inline Markdown links `[text](target)` in first-party documentation.
# `.claude/` and `.serena/` are excluded — vendored agent skills and session
# memory whose example links (e.g. a skill teaching the CONTEXT.md format with
# `./src/ordering/CONTEXT.md`) are illustrative, not references into this repo.
# This mirrors the portal link-check excluding adr/archive/audits (AB#13661): the
# guard keeps the living App docs honest (root, docs/, .intelliflow/, the per-agent
# stubs), not vendored tooling.
#
# Skipped link targets, by design —
#   - external links (http/https, mailto/tel, protocol-relative //, other :// URIs),
#   - repo-absolute paths (/foo — a served route, not a relative doc reference),
#   - in-page anchors (#section),
#   - template placeholders ({intelliflow_url}, <name>, …).
# A #fragment or ?query suffix is stripped before resolving; a link target is
# resolved relative to the directory of the file that contains it. Reference-style
# links ([text][ref]) are out of scope.
#
# Not checked, deliberately: path references written as inline code (`like/this`)
# rather than as links. A repo file path, a GitHub repo slug (`org/repo`), a
# container image ref (`ghcr.io/org/app:tag`) and a build directory (`dist/`) are
# indistinguishable to a mechanical check, so gating on them produces false
# positives. Those references are kept honest by review, not by this guard.
#
# Residual risk (accepted): only inline links are checked; a broken reference-style
# link or a wrong line-anchor inside an existing file is invisible here. The
# realistic failure mode covered is a Markdown link to a path that no longer exists
# — and, going forward, any such link an agent adds to an App's docs.
set -euo pipefail

# List the Markdown files to scan. Prefer git (respects .gitignore, so untracked
# scratch files never produce phantom findings); fall back to find on a checkout
# without git so the guard still works in a bare environment.
list_markdown() {
  # `.git` at the current directory (a dir in a normal clone, a file in a linked
  # worktree) means git can list tracked files and honor .gitignore. The guard is
  # always invoked from the checkout root, so this is deterministic — and it makes
  # non-git scratch trees fall through to find regardless of where TMPDIR lives.
  if [ -e .git ]; then
    git ls-files '*.md' ':!:.claude/**' ':!:.serena/**'
  else
    find . -type f -name '*.md' \
      -not -path './.git/*' -not -path './node_modules/*' \
      -not -path './.claude/*' -not -path './.serena/*'
  fi
}

broken=""
scanned=0
links=0

while IFS= read -r file; do
  [ -f "$file" ] || continue
  scanned=$((scanned + 1))
  dir=$(dirname "$file")

  # Extract the target of every inline link — the text inside `](...)`.
  while IFS= read -r target; do
    [ -n "$target" ] || continue
    # Drop an optional "title" that follows the URL inside the parentheses.
    target=${target%%[[:space:]]*}

    case "$target" in
      '' | '#'* | http://* | https://* | mailto:* | tel:* | /* | *://*) continue ;;
      *'{'*'}'* | '<'*) continue ;; # template placeholders / angle-bracket autolinks
    esac

    # Strip a #fragment or ?query suffix, then resolve against the file's dir.
    path=${target%%#*}
    path=${path%%\?*}
    [ -n "$path" ] || continue

    links=$((links + 1))
    if [ ! -e "$dir/$path" ]; then
      broken="$broken"$'\n'"  $file -> $target"
    fi
  done < <(grep -oE '\]\([^)]+\)' "$file" | sed -E 's/^\]\(//; s/\)$//')
done < <(list_markdown)

if [ -n "$broken" ]; then
  echo "::error::Broken relative documentation link(s) found."
  echo ""
  echo "A Markdown link points at a path that does not exist:"
  printf '%s\n' "$broken"
  echo ""
  echo "Remediation: fix the target path, or remove the link. Relative links in the"
  echo "agent-facing documentation must resolve so an agent reading the repo cold can"
  echo "follow them. External links, repo-absolute routes (/api/...), in-page anchors"
  echo "(#section) and template placeholders ({...}) are intentionally not checked."
  exit 1
fi

echo "Documentation link guard: $scanned Markdown file(s) scanned, $links relative link(s), all resolve."
