# Agent Checklist — Rubrica Aziendale

This file is the operational runbook for the AI agent working on this app.
Run through the relevant section at the start and end of every session.

---

## 1. Environment setup (first time only)

```bash
# 1. Start the dev database
#    In Codespaces (CODESPACES=true): PostgreSQL is already running via the devcontainer
#    feature — skip this step.
#    Locally: start the database with Docker.
if [ -z "$CODESPACES" ]; then
  docker compose -f docker-compose.dev.yml up -d
fi

# 2. Restore .NET tools (includes dotnet-ef)
cd App && dotnet tool restore

# 3. Apply EF Core migrations to the dev database
dotnet ef database update --project App.csproj

# 4. Install frontend dependencies
cd frontend && npm install

# 5. Install Playwright browsers (E2E)
npx playwright install chromium --with-deps
```

---

## 2. Local dev workflow (every session)

```bash
# Terminal A — backend (port 5281)
cd App && dotnet run --project App.csproj

# Terminal B — Angular dev server (port 4200)
cd App/frontend && npm run start

# Terminal C — optional: run E2E tests against the running stack
cd App/frontend && npm run e2e
```

The Angular dev-server proxies `/api/*` and `/health` to the backend automatically
(configure `proxy.conf.json` if needed — see §12).

---

## 3. Before closing a feature — quality checks

Run this full battery **once per feature, right before `/pr`** — **not per ticket commit**. In a *simple epic* (see `docs/agents/workflow.md`, "Epica semplice"), run it once before the final release PR. Per ticket you already have the `/tdd` red-green cycle plus `dotnet format`; the heavier steps here (Release build, production frontend build, E2E) belong at feature close, mirroring CI.

Run these in order. Do NOT proceed to the next step if any fails.

```bash
# 3a. .NET format (must produce zero diffs)
dotnet format App/App.csproj --verify-no-changes

# 3b. .NET build (Release mode — catches errors hidden in Debug)
dotnet build App/App.csproj --configuration Release

# 3c. .NET unit tests
dotnet test App/App.csproj --no-build --configuration Release

# 3d. Frontend production build (validates bundle budgets; regenerates the
#     role constants from roles.json via the prebuild hook)
cd App/frontend && npm run build -- --configuration production

# 3e. Playwright E2E tests (requires backend + DB running — see Step 2)
cd App/frontend && npm run e2e
```

If any step fails: **fix it before opening the PR**. Do not add `// TODO: fix` comments
as a workaround — resolve the root cause.

---

## 4. Portal Contract compliance checks

Read `.intelliflow/portal-contracts/core.md` and verify:

| # | Check | How to verify |
|---|-------|--------------|
| 1 | App listens on port **8080** | `grep -r "8080" Dockerfile` — must be in ENV/EXPOSE |
| 2 | `GET /health` endpoint exists and returns 2xx | `curl http://localhost:5281/health` |
| 3 | No `MigrateAsync()` or `EnsureCreated()` in `Program.cs` | `grep -r "MigrateAsync\|EnsureCreated" App/` |
| 4 | Connection string from `ConnectionStrings__Database` env var only | `grep -r "Host=\|Server=\|Data Source=" App/**/*.cs` — must be zero matches |
| 5 | OTel setup present in `Program.cs` | `grep -r "AddOpenTelemetry" App/Program.cs` |
| 6 | Dockerfile has 3 stages: `frontend` / `build` / `runtime` | Read `Dockerfile` |
| 7 | Migrations script generated in Dockerfile via `--idempotent` flag | Read `Dockerfile` |
| 8 | `roles.json` matches the code: every role used by `RequireRole`/policies or role-aware UI is declared | Role checks must reference the `AppRoles` constants, never role-string literals. Backend: `App/AppRoles.cs`, a hand-maintained mirror of `roles.json` — whenever `roles.json` changes, update it in the same commit (`AppRolesAlignmentTests` fails when they diverge), and `EndpointRolesAlignmentTests` fails if any endpoint requires a role `roles.json` does not declare. Both tests cover policy-based authorization only: imperative checks (`User.IsInRole`, ad-hoc `IAuthorizationService` calls) are invisible to them — prefer policies; if you must go imperative, verify by hand with `grep -rn "IsInRole" App/`. Frontend: `App/frontend/src/app/auth/app-roles.generated.ts`, regenerated from `roles.json` at every build |

---

## 5. Capability compliance checks

For each file present in `.intelliflow/capabilities/`:

### `postgres-database.md`

Run the compliance checks documented inside that file. Summary:

```bash
# No hardcoded connection strings
grep -r "Host=\|Server=\|Data Source=" App/**/*.cs  # must be empty

# Exactly one DbContext
grep -r "DbContext" App/**/*.cs | grep "class.*DbContext" | wc -l  # must be 1

# UseNpgsql is used (not UseSqlite etc.)
grep -r "UseNpgsql" App/Program.cs  # must match

# No MigrateAsync
grep -r "MigrateAsync\|EnsureCreated" App/  # must be empty
```

### `iam.md`

Run the compliance check documented inside that file. Summary:

```bash
# No development-bypass trace at release time (the excluded files legitimately document the marker)
grep -rln "INTELLIFLOW-DEV-BYPASS" --exclude-dir={.git,node_modules} --exclude={iam.md,AGENT-CHECKLIST.md,release.md,dev-bypass-guard.sh} .  # must print nothing
```

A bypass is legitimate on development branches and during the collaudo; it must be gone after the Creator's final approval and **before the release PR to `main`** (see the capability's removal obligation).

---

## 6. Adding a new feature (standard flow)

1. Read `AGENTS.md` pre-flight checklist.
2. Check if the feature requires a new Capability — if yes, fetch from IntelliFlow
   (`AGENTS.md` pre-flight step 2):
   ```bash
   source .intelliflow/config
   curl -sf "$intelliflow_url/api/portal-capabilities"
   ```
   If the call fails, report to the Creator that the portal APIs are unavailable
   from this workspace (see `core.md`) — no fallback.
3. Implement the feature following `.intelliflow/portal-contracts/core.md` guardrails.
4. For any UI, use Angular Material with the pre-installed theme (see the
   "UI guidelines" section of `AGENTS.md`); the Contacts demo is the exemplar.
5. Add/update E2E tests in `App/frontend/e2e/`.
6. Commit each ticket as its own commit with a clear message (`Closes #{ticket}`) as you go — the `/tdd` cycle covers unit tests per ticket.
7. When the feature is complete, run the full Step 3 battery once, then close the feature with `/pr` (in a simple epic: before the final release PR).

---

## 7. Adding a database migration

```bash
# Generate the migration
cd App && dotnet ef migrations add <MigrationName> --project App.csproj

# Verify the generated Up/Down methods make sense
# Apply to dev database
dotnet ef database update --project App.csproj

# Rebuild to ensure code still compiles after migration
dotnet build App/App.csproj
```

**Never** call `Database.MigrateAsync()` in code — IntelliFlow handles migration execution
via the `migrations.sql` script generated in the Dockerfile.

---

## 8. Collaudo hand-off (riconsegna)

The run's exit condition: the Creator receives a **running App**, not a promise of one.

1. Checkout the index branch; apply migrations to the dev database (§1 step 3).
2. Start the stack in background: compose services (§1 step 1), backend and frontend (§2).
3. **Verify health before declaring ready**: `curl -sf http://localhost:5281/health` returns 2xx and the frontend answers on port 4200.
4. **Verify `roles.json` against the code** (§4 row 8): every role used by `RequireRole`/policies or role-aware UI is declared in `.intelliflow/iam/roles.json`, and both `AppRoles` constant sets are aligned with it. An App delivered with missing roles ships an unusable operator side.
5. Deliver to the Creator: the URL to open, a per-feature collaudo checklist in non-technical language, parked features declared with their diagnosis, and the major dependency-debt summary (`release.md` §2).
6. Keep the stack running for the whole feedback window.

---

## 9. Creating a release

Read `.intelliflow/portal-contracts/release.md` and follow every step.
Summary:

```bash
# 1. Run all quality checks (Step 3 above)
# 2. Tag and push — there is NO version to bump in the sources: deploy.yml
#    computes the version from the tag with GitVersion and injects it into
#    the build (/p:Version and Docker build-arg)
git tag v<MAJOR.MINOR.PATCH>
git push origin v<MAJOR.MINOR.PATCH>
```

The `deploy.yml` workflow triggers on `v*` tags and pushes the Docker image to
`ghcr.io/<org>/<repo>:<tag>` (org name auto-lowercased — see §10.2).

---

## 10. CI/CD pipeline — pitfalls known and fixed

These bugs were found during the first real end-to-end run (2026-05-27) and are
already corrected in the template. If a future refactor reintroduces them, this
section tells you exactly what to look for.

### 10.1 `dotnet ef` e il manifest degli strumenti locali

`dotnet ef` è uno **strumento locale** dichiarato in `.config/dotnet-tools.json` (root del repo).
Il driver `dotnet ef` cerca il manifest risalendo la directory tree a partire dalla CWD —
non scende mai nelle sottocartelle. Può essere eseguito dalla root del repo o da qualsiasi
sottodirectory (es. `App/`): risale e trova `.config/dotnet-tools.json`.

**Regola:** ogni comando che usa `dotnet ef migrations` deve specificare `--project App.csproj`
e girare da una directory che sia `App/` o un suo antenato (tipicamente la root o `App/`).
`dotnet tool restore` può girare dalla root senza argomenti aggiuntivi.

```yaml
# ✅ Corretto
- name: Restore .NET tools
  run: dotnet tool restore
  working-directory: App

- name: Apply migrations
  working-directory: App
  run: |
    dotnet ef migrations script --idempotent --project App.csproj --output /tmp/migrations.sql
    PGPASSWORD=testpassword psql -h localhost -U testuser -d testdb -f /tmp/migrations.sql
```

```dockerfile
# ✅ Corretto nel Dockerfile
RUN cd App && dotnet tool restore
RUN mkdir -p /out/db && \
    cd App && dotnet ef migrations script \
      --idempotent --project App.csproj \
      --configuration Release --no-build \
      --output /out/db/migrations.sql
```

### 10.2 Tag Docker deve essere tutto lowercase

`github.repository` restituisce il nome con la capitalizzazione originale
(es. `Medit-EngageLabs-Test/rubrica-test`). Il registro OCI rifiuta tag con
maiuscole. Normalizzare sempre con `tr`:

```yaml
# ✅ Corretto
- name: Set lowercase image tag
  run: |
    echo "IMAGE_TAG=ghcr.io/$(echo '${{ github.repository }}' | tr '[:upper:]' '[:lower:]'):${{ github.ref_name }}" >> $GITHUB_ENV

- name: Build and push Docker image
  uses: docker/build-push-action@v6
  with:
    tags: ${{ env.IMAGE_TAG }}
```

### 10.3 Path di output Angular nel Dockerfile

`angular.json` configura `"outputPath": { "base": "../wwwroot", "browser": "" }`.
Nel frontend stage Docker (WORKDIR `/src`, sorgente copiato in `/src`), Angular
emette i file statici in `/wwwroot` — **non** in `/src/dist/frontend/browser`
(path di default Angular senza override).

```dockerfile
# ✅ Corretto
COPY --from=frontend /wwwroot ./App/wwwroot

# ❌ Sbagliato — directory inesistente
COPY --from=frontend /src/dist/frontend/browser ./App/wwwroot
```

### 10.4 `dotnet dotnet-ef` è una doppia invocazione

Il comando corretto per invocare il tool locale è `dotnet ef` (il driver `dotnet`
riconosce `ef` come alias del tool). `dotnet dotnet-ef` cerca un subcommand
inesistente e fallisce.

```dockerfile
# ✅ Corretto
RUN cd App && dotnet ef migrations script ...

# ❌ Sbagliato
RUN dotnet dotnet-ef migrations script ...
```

### 10.5 `--no-build` richiede `--configuration Release` e `mkdir -p`

`dotnet ef migrations script --no-build` senza `--configuration` cerca la build
in `Debug/` per default. Il Dockerfile pubblica con `Release`, quindi gli artefatti
Debug non esistono → exit code 129.

Inoltre `dotnet publish` crea `/out` ma non `/out/db/` — l'output del migrations
script fallisce se la subdirectory non esiste.

```dockerfile
# ✅ Corretto
RUN mkdir -p /out/db && \
    cd App && dotnet ef migrations script \
      --idempotent \
      --project App.csproj \
      --configuration Release \
      --no-build \
      --output /out/db/migrations.sql

# ❌ Sbagliato — Debug artifacts mancanti, /out/db/ inesistente
RUN dotnet ef migrations script \
      --idempotent \
      --project App/App.csproj \
      --no-build \
      --output /out/db/migrations.sql
```

---

## 11. Diagnosing a production issue

When the app misbehaves in production, follow this order:

1. **Health check** — `GET /health` must return `{"status":"healthy"}`.
   If it returns non-2xx: the app process is alive but unhealthy — check DB connectivity.
   If it times out: the process may be crashed — check container logs.

2. **Structured logs** — every Contacts operation emits a structured log entry with an
   `EventId` (1001–1006). Filter by event name:
   - `ContactsListed` (1001) — list/search operations
   - `ContactFound` (1002, **Debug**) — a single contact retrieved by id
   - `ContactNotFound` (1003, **Warning**) — a requested ID did not exist
   - `ContactCreated` (1004) — new entries
   - `ContactUpdated` (1005) — edits
   - `ContactDeleted` (1006) — deletions

3. **Distributed traces** — each HTTP request generates a trace with:
   - ASP.NET Core span (request/response)
   - Npgsql spans (individual SQL queries)
   - All log records linked to the same `TraceId`

   Open the OTel collector / Jaeger / Grafana Tempo dashboard and filter by `TraceId`
   from the log entry to see the full call chain.

4. **OTel attributes to check**:
   - `service.name` — should match the application name
   - `service.version` — must match the release tag (injected at deploy time by GitVersion; there is no committed version in the sources)
   - `db.statement` — the SQL query (Npgsql span)
   - `http.response.status_code` — HTTP status on the ASP.NET span

---

## 12. Proxy configuration (dev only)

If the Angular dev server on port 4200 can't reach the backend on port 5281,
create `App/frontend/proxy.conf.json`:

```json
{
  "/api": {
    "target": "http://localhost:5281",
    "secure": false
  },
  "/health": {
    "target": "http://localhost:5281",
    "secure": false
  }
}
```

Then add `--proxy-config proxy.conf.json` to the `start` script in `package.json`.
