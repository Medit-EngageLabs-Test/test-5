# IntelliFlow App — Agent Instructions

You are the AI agent assisting this App's Creator. The Creator does not write code directly: they describe what they want, and you implement it while respecting the constraints imposed by IntelliFlow.

This file is the **entry point**. It tells you where to start and which documents govern the work — it does not duplicate them.

---

## Where to start — every development request

**Every development request starts with `/grill-with-docs`**: interview the Creator until the intent is clear, then follow the lifecycle in `docs/agents/workflow.md` (grilling → definition → index branch → serial feature implementation → collaudo → feedback cycles → release).

Two regimes exist, declared by the portal contract (`.intelliflow/portal-contracts/git-workflow.md`):

- **Autonomous regime — Claude Code only.** The full workflow in `docs/agents/workflow.md`, powered by the repo skills (`/grab`, `/pr`, `/to-spec`, `/to-tickets`, `/implement`, …) and enforced by the hooks in `.claude/settings.json`. After the grilling, the Creator is involved at **three gates only** (epic draft, collaudo, final confirmation with SemVer bump choice); everything else — commits, pushes, PRs, intermediate merges — is autonomous. The Creator's "ok" at gate 1 is the run's **contractual pre-authorization** for all of it: it prevails over any generic confirmation rule (global instructions, "confirm before committing" habits), the interactive checkpoints inside the skills self-disable for the whole run, and `/grab` on the epic sets the run goal mechanically (exit condition: hand-off to collaudo). See "Pre-autorizzazione del run" in `docs/agents/workflow.md`.
- **Base regime — any agent other than Claude Code.** The template targets Claude Code and ships no configuration for other agents; if one is nonetheless pointed at this repo, it must work on a branch, open a PR to `main`, and **wait for the Creator to confirm before every merge**. The conventions in `docs/agents/` remain good guidance, but the autonomous mechanics (skills, hooks) are not guaranteed outside Claude Code.

---

## Definition of done — by phase

A development request (epic) is done when it is **released**: merged to `main`, tagged, deployed, and the App shows `Running` in the IntelliFlow portal. Each phase has its own done:

| Phase | Done when |
|---|---|
| Definition | Epic, features and tickets published on GitHub Issues with their dependencies |
| Feature | Feature branch merged into the index branch with green CI |
| Collaudo | Stack running, health check verified, URL + per-feature checklist delivered to the Creator |
| Release | Tag `vX.Y.Z` pushed, `deploy.yml` green, App `Running` in the portal, epic tree reconciled |

Do not report a phase as complete at any earlier step.

---

## Pre-flight — run at the start of every session (best-effort)

1. Read `.intelliflow/config` to obtain the IntelliFlow URL.
2. **Reach the portal API.** `GET /api/portal-capabilities` is called directly over HTTP — no credential or header is required. If the call fails (network error, or a non-2xx status), report to the Creator that the portal APIs are not available from this workspace and continue with the local files only — **do not improvise a fallback**. Git and GitHub operations authenticate with the workspace's native GitHub identity (see the `git-push` capability), not a portal-issued token. See "Portal API access from the agent workspace" in `core.md` for the full contract (supported environments).
3. **Best-effort**: try `GET {intelliflow_url}/api/portal-contract` to get the current Portal Contract version. If the endpoint does not respond (404, network error), **skip the comparison and proceed with the local contracts** — never block the session on this step.
4. If it responds, compare with `.intelliflow/contract-version` (the version of the Template Bundle this App was scaffolded from). **If the contract has changed:**
   - Notify the Creator of any breaking changes **before proceeding with any work**.
   - Download the updated content and overwrite all files in `.intelliflow/portal-contracts/` and `.intelliflow/contract-version`.
5. Read every file in `.intelliflow/portal-contracts/`.
6. For every file present in `.intelliflow/capabilities/`, load it — each one represents an active Capability for this App.
   > `.intelliflow/capabilities/` only contains the Capabilities this App has activated. The full catalog of what IntelliFlow can provide is available at `GET {intelliflow_url}/api/portal-capabilities`.

---

## During development

- Never violate the constraints defined in `.intelliflow/portal-contracts/`.
- Never modify the `App.Platform` project or the platform authentication wiring in `Program.cs` (`AddPlatformAuthentication` / `UsePlatformAuthentication`): it is IntelliFlow **platform code** — see the IAM section of `core.md`.
- Respect the guardrails in every active Capability file (`.intelliflow/capabilities/*.md`).
- For any infrastructure requirement (database, file storage, email, messaging, external integrations, etc.) always check first whether the portal offers a Capability: call `GET {intelliflow_url}/api/portal-capabilities` (see pre-flight step 2). If a matching Capability exists, use it. If not, proceed with local means where feasible and inform the Creator that portal support is unavailable.
- If the Creator asks for something that requires a new Capability (e.g. a different database, a SAP connection):
  1. Call `GET {intelliflow_url}/api/portal-capabilities` to see the full catalog of what IntelliFlow supports.
  2. If the Capability exists in the catalog, call `GET {intelliflow_url}/api/portal-capabilities/{name}/skill` to download the skill file and save it to `.intelliflow/capabilities/{name}.md`, then **apply its Activation recipe end to end** — the skill tells you everything to configure (dev compose service, local config, CI env, package, services manifest, skill stub). Activation is complete only when the skill's compliance check passes.
  3. If the Capability is not in the catalog, inform the Creator that IntelliFlow does not currently support it and suggest alternatives **from the catalog only**.

### After every push

After every `git push`, monitor the triggered pipeline run until completion (the `post-push-ci-watch` hook does this automatically in Claude Code sessions):

```bash
RUN_ID=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
```

If the run fails, read the errors and fix them before pushing again:

```bash
gh run view "$RUN_ID" --log-failed
```

Repeat the push → watch → fix cycle until the pipeline is green. Do not declare a phase complete while any run is pending or red. See `git-workflow.md` for the full obligation, and `docs/agents/workflow.md` for the failure budget (3 consecutive red runs → park the feature).

---

## Code language standard — always, regardless of the Creator's language

**Binding rule**: identifiers, comments, and XML/JSDoc are always in English —
even when the Creator describes the App in Italian. This is what prevents a
`StorageKey` from getting an inconsistent sibling like `CaricatoOid`.

- **English, always**: class/method/property/variable names, comments, XML doc
  (`<summary>`, JSDoc), and any other code-facing text.
- **Italian, only**: strings visible to the App's end user (UI labels, validation
  messages, emails, notifications) and test descriptions/names.
- **Bridge the two with the glossary.** When a domain term surfaces in Italian
  conversation with the Creator, record it in `CONTEXT.md`'s glossary (Italian
  term → English identifier — see "Glossario italiano → inglese" in
  `CONTEXT.md`) before using it in code, and reuse that mapping consistently
  afterward instead of re-deriving a translation each time the concept recurs.

## UI guidelines — Material 3 (binding, on demand)

Every UI you build or modify must follow the [Material 3 guidelines](https://m3.material.io/) — M3 type scale, 8dp grid, WCAG 2.1 AA contrast/focus, a single seed-generated theme via `--mat-sys-*` tokens, and Angular Material components (the Contacts demo is the exemplar to replicate). This is a platform-wide requirement, not a stylistic preference.

The full rules live **on demand** in `docs/agents/conventions.md`, kept out of this always-loaded entry point to minimize per-turn context (Feature #13706). **Consult it before building or modifying any UI.**

---

## Before a Release

A release happens **only after the Creator's explicit confirmation** (gate 3 of `docs/agents/workflow.md`), with the SemVer bump the Creator chose on your proposal (patch = bugfix; minor = non-structural features; major = structural changes).

1. Follow the checklist in `release.md` (already loaded at pre-flight).
2. Create the SemVer tag (`vX.Y.Z`) on `main` **only if every check passes**. There is no version to bump in the sources: the deploy pipeline computes it from the tag with GitVersion.
3. Monitor the `deploy.yml` workflow run (`gh run watch`) until completion. If any job fails, read the logs (`gh run view --log-failed`), fix the issue, open a PR on a new branch, wait for CI to pass, merge, then create a new tag.
