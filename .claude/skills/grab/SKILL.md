---
name: grab
description: Opens work on a workflow issue — for an epic creates its work branch (an index branch if structured, or a single epic branch if simple) and sets the run goal; for a feature creates the feature branch. Checks blockers first. Use when the workflow says to start a macro-request or a feature.
---

# /grab — opening the work

Open work on the issue given as argument (GitHub number). This command only runs the *lifecycle* step (the branch); the actual implementation is done afterward by `/implement`. Keep the command short and linear: no code here.

> **No claim / assignee.** The whole run is driven by a single agent, so who an issue is "assigned to" carries no signal — `/grab` does **not** assign the issue. The frontier query (`issue-tracker.md`) excludes items by open blockers only, never by assignee, so leaving issues unassigned changes nothing about which item comes next.

## First: read the project rules

Read, if you haven't already done so in this session:

- `docs/agents/workflow.md` — phases, gates, branch convention.
- `docs/agents/issue-tracker.md` — GitHub commands for hierarchy, dependencies, labels.

## Steps

1. **Fetch the issue** and classify it in the hierarchy:
   - **epic (macro-request)**: it isn't a sub-issue of anything and its sub-issues are features;
   - **feature**: it's a sub-issue of the epic.

   ```bash
   gh issue view {n}
   gh api repos/{owner}/{repo}/issues/{n} --jq '{subs: .sub_issues_summary, blocked: .issue_dependencies_summary.blocked_by}'
   ```

2. **Blocker gate** — if `issue_dependencies_summary.blocked_by > 0`, the issue has open blockers: **refuse to start** and explain which ones:

   ```bash
   gh api repos/{owner}/{repo}/issues/{n}/dependencies/blocked_by \
     --jq '.[] | select(.state == "open") | "#\(.number) \(.title)"'
   ```

   No exceptions: unblock (or park) the blockers first, then try again.

3. **Derive the branch name**: `{slug}` from the issue title, kebab-case, max 5 words.

   - **`/grab` on an epic** → first pick the regime (see `workflow.md`, "Convenzione branch"): does **any** feature of the epic have sub-issues (tickets)?

     ```bash
     # total tickets under each feature; >0 anywhere ⇒ structured, else simple
     gh api repos/{owner}/{repo}/issues/{n}/sub_issues --jq '.[].number' \
       | xargs -I % gh api repos/{owner}/{repo}/issues/% --jq '.sub_issues_summary.total'
     ```

     - **structured** (at least one feature has tickets) → create the **index branch** from `main`:

       ```bash
       git fetch origin
       git switch -c index/{n}-{slug} origin/main
       git push -u origin index/{n}-{slug}
       ```

     - **simple** (no feature has tickets) → create the single **epic branch** from `main`. Features become commits on it; the `epic/**` name is deliberate — the commit guard only blocks `main`/`index/**`, so commits on `epic/**` pass:

       ```bash
       git fetch origin
       git switch -c epic/{n}-{slug} origin/main
       git push -u origin epic/{n}-{slug}
       ```

     Either way, first verify that **no other work branch is already active** (`git branch -r | grep -E 'origin/(index|epic)/'`): only one at a time. If one exists, stop and flag it.

   - **`/grab` on a feature** (structured epics only — in a simple epic, features are commits and are never grabbed) → create the **feature branch from the active index** (which must exist and be unique):

     ```bash
     git fetch origin
     git switch -c feature/{n}-{slug} origin/index/{epic-n}-{epic-slug}
     git push -u origin feature/{n}-{slug}
     ```

4. **Run goal** — only on `/grab` of an **epic**: fix the run's goal, without asking the Creator anything. **Adopt it as a standing instruction for the whole run** — hold this text in your working context and re-read it each turn. This standing instruction is what guarantees the goal; **do not rely on a slash command to carry it.** Slash commands (a harness `/goal` included) are recognized only at the *start of a user message* and are user input — the agent driving this workflow cannot self-activate one mid-run, so a `/goal` emitted from inside a skill run does not reliably enter goal mode:

   > **Run goal.** Epic #{n} handed back to acceptance testing: every non-parked feature is integrated into the work branch (the index, or the epic branch in a simple epic) with green CI, the stack is up with the health check verified, roles.json is verified against the roles used by the code, and the delivery message (URL + acceptance-testing checklist, declared parked features, major-dependency debt summary) has been sent to the Creator.

   If your harness exposes a persistent-goal feature (e.g. Claude Code's `/goal`) that the Creator can type at the start of a message, mirroring the text above into it is a welcome extra — but never the sole mechanism.

   From here, the run's exit condition is the hand-off to acceptance testing: no process question to the Creator before that point (see "Pre-autorizzazione del run" in `docs/agents/workflow.md`); the only legitimate interruptions are a documented external blocker or a park.

   On `/grab` of a **feature** with an active index (feedback cycles, new session, after a compaction): if the run's goal isn't present in your current context, restate the same standing instruction.

5. **Close by summarizing**: issue, type (epic/feature), regime (for an epic: simple/structured), active branch. Then state the next step:
   - after `/grab` of a **structured epic** → `/grab` of the first frontier feature (with no open blockers);
   - after `/grab` of a **simple epic** → implement the first frontier feature directly as a commit on `epic/**` (no per-feature `/grab`), with `Closes #{feature}`; there is no `/pr` until the final `epic/**`→`main` release PR;
   - after `/grab` of a **feature** → `/implement` its tickets in frontier order, one commit per ticket with `Closes #{ticket}`, then `/pr`.
