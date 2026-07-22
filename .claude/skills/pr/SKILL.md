---
name: pr
description: Closes the current feature — format gate, PR toward the index branch, wait for green CI, merge with a merge commit and closing references, branch deletion. Handles parking after 3 consecutive red CI runs.
---

# /pr — closing a feature

Closes the feature on the current branch by opening its PR toward the index branch and merging it **only when CI is green**. Read `docs/agents/workflow.md` first if you haven't already done so in this session.

> **Structured epics only.** This command merges a **feature branch into the index**. In a *simple epic* (no feature has tickets — see `workflow.md`, "Epica semplice") there are no per-feature PRs: features land as commits on the single `epic/**` branch and the only PR is `epic/**`→`main`, opened as the **Release** step. Don't run `/pr` there.

## Preconditions

- The current branch is `feature/{n}-{slug}` (never `main`, never `index/**`).
- Every ticket of the feature has its commit with `Closes #{ticket}` in the message. Verify with `git log origin/index/{epic-n}-{epic-slug}..HEAD --oneline`: if a ticket is missing, stop and complete it first.

## Steps

1. **Format gate (blocking)** — the same checks as CI, run locally:

   | Check | Fix if it fails |
   |---|---|
   | `dotnet format App.sln --verify-no-changes` | `dotnet format App.sln` |
   | `npm run format:check` (in `App/frontend`) | `npm run format` |
   | `npx ng lint` (in `App/frontend`) | fix the findings |

   If a fix changes files, commit those changes too on the feature branch (a fix commit, without `Closes`).

2. **Push and PR toward the index** (CI starts on the PR — `pull_request` trigger toward `index/**` — not on the push):

   ```bash
   git push -u origin feature/{n}-{slug}
   gh pr create --base index/{epic-n}-{epic-slug} \
     --title "{feature title}" \
     --body "..."   # what the feature delivers, in Creator-facing language
   ```

   **No `Closes #{feature}` in the body**: that reference goes in the merge commit (step 4), where it creates the issue↔commit link and acts as a safety net on `main`; the actual closing happens at step 5.

3. **Wait for CI**: `gh pr checks --watch --fail-fast`. If red: read the logs (`gh run view {run-id} --log-failed`), fix, commit, push again. Count the **consecutive red runs** for this feature.

4. **Merge when CI is green** — always a merge commit, **never squash or rebase** (they rewrite the commits and lose the tickets' `Closes` references):

   ```bash
   gh pr merge --merge --delete-branch \
     --subject "Merge feature #{n}: {title}" \
     --body "Closes #{n}"
   ```

   Then switch back to the index and align it: `git switch index/{epic-n}-{epic-slug} && git pull`.

5. **Close the issues** — merged into the index = closed (this is what unblocks the frontier's `blocked_by`, see `workflow.md`):

   ```bash
   MERGE_SHA=$(git rev-parse HEAD)
   gh api --paginate repos/{owner}/{repo}/issues/{n}/sub_issues \
     --jq '.[] | select(.state == "open") | .number' \
     | xargs -I % gh issue close % --comment "Contenuta nel merge della feature #{n} nella index ($MERGE_SHA)."
   gh issue close {n} --comment "Mergiata nella index ($MERGE_SHA)."
   ```

6. **Summarize**: feature merged, issues closed, next frontier feature (or hand-off to acceptance testing if it was the last one).

## Parking — on the third consecutive red CI run

Don't push past the budget (see `workflow.md`):

1. `parked` label on the feature (idempotent creation, see `issue-tracker.md`);
2. comment on the feature with the diagnosis: what's failing, what you tried, remaining hypotheses;
3. PR left **in draft** (`gh pr ready --undo`), **not merged**;
4. switch back to the index (`git switch index/…`) and continue with the next **unblocked** feature. Features that depend on the parked one stay blocked by construction.
