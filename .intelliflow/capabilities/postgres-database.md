# Capability: PostgreSQL Database

Version: 2026-07-17

This App uses a dedicated PostgreSQL database provisioned by IntelliFlow. Each deploy receives an isolated database with automatically rotated credentials.

---

## Guardrails — always respect these constraints

### Connection string

The database connection comes **exclusively** from the environment variable `ConnectionStrings__Database`, injected by IntelliFlow at deploy time. Do not hardcode host, port, username, or password.

You may keep local values in `appsettings.json` for development; they are ignored in production.

### EF Core and DbContext

- Use EF Core with the Npgsql provider.
- One `DbContext` per App — do not create additional ones.
- Entities must be added to the existing `DbContext`, not to separate new contexts.

### Migrations

Migrations are managed by IntelliFlow, not by the App:

1. **Do not call `Database.MigrateAsync()` at startup** — IntelliFlow applies migrations before starting the container.
2. Every schema change requires an EF Core migration: `dotnet ef migrations add <MigrationName>`.
3. The Dockerfile automatically generates `/app/db/migrations.sql` via `dotnet ef migrations script --idempotent`. Do not remove this step.

### Database access

- Do not open direct PostgreSQL connections outside of EF Core (no manual `NpgsqlConnection`) except in documented exceptional cases.
- Do not create tables or schemas via raw SQL without a corresponding migration.

---

## When this skill is invoked

Run the following checks and report the outcome to the Creator:

### Local compliance check

- [ ] `DbContext` uses `UseNpgsql` and reads from `ConnectionStrings:Database`
- [ ] No call to `Database.MigrateAsync()` or `Database.EnsureCreated()` in `Program.cs`
- [ ] `dotnet ef migrations script --idempotent` produces a SQL file without errors
- [ ] The Dockerfile includes the migrations generation step

### Capability update check

This capability ships **pre-activated with the App template** (it is listed in `.intelliflow/services`
from the first scaffold): the portal catalog (`GET {intelliflow_url}/api/portal-capabilities`) serves
only the Capabilities an agent can activate on demand, so there is **no remote skill to compare
against**. This file is updated together with the template itself — do not call the portal looking for
a newer version, and do not treat this capability's absence from the catalog as an error.
