# Capability: Git Push

Version: 2026-07-21

The agent authenticates Git and GitHub operations against the application repository with the
**workspace's native GitHub identity** — the Creator's identity, which has write access to the
repository because the Creator is a member of the IntelliFlow organization (see the operator runbook
"Onboarding di un Creator"). IntelliFlow no longer brokers push tokens: there is no per-App key and
no portal endpoint to fetch a credential from.

---

## Guardrails — always respect these constraints

### Credentials

- Use the **ambient** GitHub credential of the workspace. Do not hardcode, print, or copy tokens
  anywhere that outlives the process, and never commit a credential to the repository.
- Do not invent an alternative authentication (personal access tokens pasted into git config,
  `.netrc`, SSH keys you generate): if the ambient credential cannot push, stop and report to the
  Creator — do not improvise a fallback.

### Scope

- Operate only on **this application's repository** (`git remote get-url origin`). Never push to a
  fork or a personal copy.

---

## Authenticating

Which credential is ambient depends on the workspace. Detect it, do not ask the Creator:

- **Codespace** (`$CODESPACES` is set, or `$GITHUB_TOKEN` is present): the Codespace's built-in token
  is already wired into `git` and `gh`. Nothing to configure — `git push`, `git tag` and `gh` work
  out of the box. The token's write scope comes from the Creator's access to the repository.
- **Local clone** (no Codespace environment): the Creator must have an authenticated GitHub CLI with
  write access to the repository. Verify it before the first push:

  ```bash
  gh auth status
  ```

  If it is not authenticated (or lacks write on this repository), **stop** and tell the Creator that
  a signed-in `gh` with write access is required in a local workspace — do not search for other
  credentials and do not improvise a fallback.

---

## When this skill is invoked

Verify authentication (above) and then run the following compliance check. Report the outcome to the
Creator before proceeding.

### Pre-push compliance check

- [ ] `git remote get-url origin` returns the expected repository URL (not a fork or personal copy)
- [ ] The ambient credential can write: in a Codespace `$GITHUB_TOKEN`/`$CODESPACES` is present; in a
      local clone `gh auth status` is green with write access to this repository

### Capability update check

1. Read the installed version: `Version` field at the top of this file.
2. Call `GET {intelliflow_url}/api/portal-capabilities/git-push/skill` (URL from `.intelliflow/config`)
   — a plain HTTP GET, no credential or header. If the portal is unreachable or the call fails,
   report that the portal APIs are not available from this workspace and continue with the local file.
3. If the remote version is newer, explain to the Creator the differences in non-technical terms and
   ask for permission to update. After updating, re-run the compliance check above before proceeding.
