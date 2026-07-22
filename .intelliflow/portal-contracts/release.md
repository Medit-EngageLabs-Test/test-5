# Portal Contract — Pre-Release Checklist

Run these checks **in order** before creating a SemVer tag. If any check fails, fix it and start over. Do not create the tag until every check passes.

---

## 1. Code quality

- [ ] `dotnet format --verify-no-changes` — no formatting violations
- [ ] `dotnet build --configuration Release` — build succeeds with no errors; **warnings are blocking**: fix them before tagging. The only exception is pre-existing dependency debt, governed by the semver policy below (§2).
- [ ] `dotnet test` — all tests pass
- [ ] `npm run build` (inside `frontend/`) — Angular build succeeds with no errors

---

## 2. Dependency debt — semver policy

Dependency updates pending at release time (Dependabot PRs, outdated packages, advisories on current versions):

- **minor / patch** → resolve during this run: apply the update, get CI green, merge before the tag.
- **major** → does not block the release. Summarize the debt to the Creator in the hand-off, proposing as a follow-up — once the Creator has confirmed the App works — to verify that the deploy steps are unaffected (reading the workflow and the Dockerfile, without launching the build) and attempt the upgrade. Duty first, cosmetics later.

---

## 3. Portal Contract compliance

- [ ] `GET /health` exists and returns `200 OK` locally
- [ ] The Dockerfile contains the migrations generation stage (`dotnet ef migrations script --idempotent`)
- [ ] `migrations.sql` is produced correctly: `docker build . --target build` does not fail
- [ ] The App listens on port `8080` — verify `ASPNETCORE_URLS` in the Dockerfile or `Program.cs`
- [ ] The connection string is read from `ConnectionStrings__Database` (not hardcoded)
- [ ] **`roles.json` matches the code**: every role the code authorizes with (`RequireRole`/policies in the backend, role-aware UI on `/api/auth/me`) is declared in `.intelliflow/iam/roles.json` with `value`, `displayName` and `description` (see `core.md`). An App released with roles missing from `roles.json` has an unusable operator side in production: nobody can be assigned the missing roles.
- [ ] **No development bypass left**: `grep -rln "INTELLIFLOW-DEV-BYPASS" --exclude-dir={.git,node_modules} --exclude={iam.md,AGENT-CHECKLIST.md,release.md,dev-bypass-guard.sh} .` prints nothing. The bypass is legitimate during development and the collaudo, but must be removed — code, configuration and marker comments — once the Creator approved the collaudo and **before this release starts** (iam capability, "Removal obligation"). CI enforces this: the release PR to `main` and the deploy on the tag both fail while the marker is present. A bypass whose files carry no marker is invisible to that guard — it would be a direct violation of the capability rule, so remove it just the same.

---

## 4. Capability compliance

For every file in `.intelliflow/capabilities/`, invoke the corresponding skill and follow the verification instructions inside it.

---

## 5. Creating the tag

Only once all checks above are green:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

The tag triggers the GitHub Actions CI/CD pipeline, which builds the Docker image and notifies IntelliFlow via webhook.
