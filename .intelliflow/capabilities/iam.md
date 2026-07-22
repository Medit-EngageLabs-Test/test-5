# Capability: IAM

Version: 2026-07-21

IntelliFlow owns authentication and role-based authorization for every App. This capability is the home of application authentication for the agent: how to write App code against the platform's BFF, and how to exercise role-gated behavior in local development and collaudo through a temporary, strictly disciplined bypass. It ships **pre-activated with the App template** — nothing to install or configure. The scaffold contains **no bypass code**: you build it ad hoc when needed, following the rules below.

---

## The contract lives in core.md

The authentication contract is defined once, in the portal contract (`.intelliflow/portal-contracts/core.md`, section "IAM"): the `App.Platform` BFF and the two `Program.cs` calls, the injected `OIDC_*` environment variables and the client-secret constraints, the open mode when those variables are absent, `roles.json` and the `roles` claim. This capability does not restate those rules — read that section first. Where the two documents seem to disagree, `core.md` wins.

## BFF rules when writing App code

Operational rules for building features on top of the platform authentication — the underlying constraints are core.md's, cited by name instead of restated:

- **Identify the user through `GET /api/auth/me`, and nothing else.** What it returns, and the other platform endpoints, are listed in core.md ("Platform authentication code"). Custom identity headers, tokens or session parsing are always the wrong answer.
- **There is nothing to attach to frontend calls.** The session travels as an HttpOnly cookie by itself; if a feature seems to need a token or an `Authorization` header, the design is fighting the contract (core.md: Apps accept no bearer tokens, no machine-to-machine surface).
- **Authorize by role on both sides through the `AppRoles` constants** (backend `App/AppRoles.cs`, frontend `app-roles.generated.ts`) — never role-string literals, and never a role missing from `.intelliflow/iam/roles.json` (AGENT-CHECKLIST §4, row 8).
- **Design for the open mode** (core.md: without the OIDC variables the App runs open — local development and CI only): the UI must stay usable there (the template's `hasRole` grants everything in that mode) and the code must not replicate authentication by other means.

## Temporary development bypass

The open mode gives you *no user at all*; many features need *distinct users with distinct roles* to be exercised — the Writer sees the edit button, the Admin sees delete, the anonymous request gets 401. When local development or the collaudo needs that, build a **temporary bypass**: a mechanism that lets a request impersonate a chosen identity with chosen roles without the real identity provider.

**The mechanism is deliberately free.** No header name, no interface, no class is prescribed — a header-driven test authentication scheme, a fake sign-in page, a seeded session: whatever fits the App. It does not need to match what a previous run did. Registering an additional authentication scheme from App code is fine; modifying `App.Platform` is not (the core.md rule holds for the bypass too).

**Cover both tiers.** The frontend decides what to show from `GET /api/auth/me`, and in open mode that endpoint is not mapped (the platform maps it only with the OIDC contract present), so `hasRole` grants everything. A bypass that only registers a backend authentication scheme therefore makes backend authorization correct but leaves the frontend showing every role's view. To exercise an operator view against a customer view locally, the bypass must also surface the impersonated identity and its roles on `GET /api/auth/me`.

Only three constraints are prescribed, and they are non-negotiable:

1. **Marker in every touched file.** Every file the bypass touches — files created for it and files edited for it — carries the literal marker `INTELLIFLOW-DEV-BYPASS` in a comment near the touched code. The marker is what makes the bypass findable and its removal mechanical.
2. **Only declared roles.** The bypass impersonates only roles declared in `.intelliflow/iam/roles.json` (reference them through the `AppRoles` constants). An invented role exercises paths no real user can ever reach and hides a roles.json misalignment the release checks exist to catch.
3. **Temporary means removed** — see the removal obligation below.

## Removal obligation

- The bypass is legitimate on development branches and during the collaudo.
- Once the Creator approves the collaudo and **before the release process starts**, remove every trace: code, configuration, marker comments. With the Claude Code workflow this happens between gate 3 (final confirmation) and the release PR (`docs/agents/workflow.md`); with any other agent, before opening the PR to `main`.
- **Never on `main`.** A release containing the marker ships an App whose authentication can be stepped around: that is a contract violation, not a cleanup debt.

### Compliance check

```bash
grep -rln "INTELLIFLOW-DEV-BYPASS" --exclude-dir={.git,node_modules} --exclude={iam.md,AGENT-CHECKLIST.md,release.md,dev-bypass-guard.sh} .
```

Must print nothing at release time (the excluded files legitimately document the marker: this capability, the two checklists and the CI guard that enforces this rule). While a bypass exists, the same command is the authoritative list of what removal must touch.

## Capability update check

1. Read the installed version: `Version` field at the top of this file.
2. Call `GET {intelliflow_url}/api/portal-capabilities/iam/skill` (URL from `.intelliflow/config`) — portal-unreachable behavior as in `core.md`, "Portal API access from the agent workspace".
3. If the remote version is newer, explain to the Creator the differences in non-technical terms and ask for permission to update. After updating, re-run the compliance check above.
