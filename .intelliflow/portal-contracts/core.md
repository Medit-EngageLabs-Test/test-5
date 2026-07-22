# Portal Contract — Core

These constraints are **non-negotiable**. Every App must respect them to function correctly inside IntelliFlow. Do not remove, modify, or work around them.

---

## Application port

The App must listen on port **8080**.

```
ASPNETCORE_URLS=http://+:8080   ← set by IntelliFlow at deploy time
```

Do not configure alternative ports. Do not expose other ports in the Dockerfile (`EXPOSE 8080` is the only one).

---

## Health Check

The App must expose `GET /health` returning `200 OK` when operational.

IntelliFlow uses this endpoint to determine whether the App has finished starting (`Starting → Running`) and to detect crashes in production (`Running → Restarting`).

**Never remove this endpoint. Never change its path.**

---

## Dockerfile

The Dockerfile must be multi-stage and produce a self-contained image. Required structure:

1. **Frontend stage** (`node`) — builds the frontend; output goes to `/app/wwwroot`
2. **Build stage** (`dotnet sdk`) — restores, publishes, and generates `/out/db/migrations.sql` via `dotnet ef migrations script --idempotent`
3. **Runtime stage** (`dotnet aspnet`) — copies the publish output and `migrations.sql`

Do not remove the migrations generation stage. IntelliFlow applies `migrations.sql` to the App's dedicated database on every deploy.

---

## Database migrations

Migrations must be generated as an idempotent SQL script (`--idempotent`) and included in the Docker image at `/app/db/migrations.sql`.

IntelliFlow applies migrations to the App's database before starting the container. **The App must never apply migrations on its own at startup.** Do not call `Database.MigrateAsync()` or `Database.EnsureCreated()` in `Program.cs`.

---

## Database connection string

The connection string is injected by IntelliFlow via environment variable:

```
ConnectionStrings__Database
```

The value in `appsettings.json` is only used locally. In production it is always overridden by IntelliFlow. Do not hardcode credentials.

---

## Persistent file storage

Container storage is ephemeral — the filesystem resets on every redeploy. **Never save user-uploaded files or persistent content to the local filesystem** (e.g. `IWebHostEnvironment.ContentRootPath`, `WebRootPath`, static paths, or any named local directory). Files written to disk are lost on the next deploy.

For any feature that stores files on behalf of users or the application domain, activate a portal Capability before writing any code. Before implementing file-persistence logic, call `GET {intelliflow_url}/api/portal-capabilities` (see "Portal API access from the agent workspace" below) and activate the appropriate Capability.

> Temporary files used for in-request processing (e.g. buffering an upload before forwarding it) are permitted, provided they are deleted within the same request.

---

## IAM

IntelliFlow manages authentication and role-based access control for each App via Entra External ID. Authentication is implemented by **platform code** — a BFF (Backend-for-Frontend) with an encrypted HttpOnly session cookie and the OIDC code flow as a confidential client — and configured entirely from environment variables injected by IntelliFlow. The App declares its roles in `roles.json` and authorizes with the `roles` claim.

This section is the contract. The **how-to for the agent** — writing App code against the BFF, and the temporary development bypass with its removal obligation — lives in the `iam` capability (`.intelliflow/capabilities/iam.md`).

### Platform authentication code (`App.Platform`)

The BFF lives in the **`App.Platform`** project, activated by two calls in `Program.cs` (`builder.AddPlatformAuthentication()` and `app.UsePlatformAuthentication()`).

- **Never modify, remove, or work around** the `App.Platform` project, the two calls in `Program.cs`, or the `.AllowAnonymous()` on `/health`. This code is owned by IntelliFlow.
- The platform maps `GET /api/auth/login`, `POST /api/auth/logout` and `GET /api/auth/me` (returns `oid`, `displayName`, `email`, `roles` of the signed-in user). Do not redefine these endpoints; build user-aware UI on top of `/api/auth/me`.
- With the platform authentication active, every endpoint and static file requires an authenticated session by default (`FallbackPolicy` + SPA gate). Unauthenticated page loads are redirected to the identity provider (arriving from the portal this completes as a silent SSO); unauthenticated `/api/*` calls receive `401`, role failures `403`.
- **Apps do not accept bearer tokens.** There is no machine-to-machine API surface toward Apps: do not register a JWT bearer scheme, do not validate `Authorization: Bearer` headers.
- When the OIDC environment variables are **absent**, the App runs **without authentication** and logs a warning at startup. This happens in local development and CI only: in production IntelliFlow always injects the contract for registered Apps. Do not replicate authentication by other means in that mode.

### Environment variables injected by IntelliFlow

At deploy time IntelliFlow injects the following variables into the container:

| Variable | Value |
|---|---|
| `OIDC_ISSUER` | The Entra External ID issuer URL (the OIDC authority) |
| `OIDC_CLIENT_ID` | The App's client ID (also the expected audience of its tokens) |
| `OIDC_CLIENT_SECRET` | The App's OIDC client secret — see the constraints below |

Do not hardcode issuer, client ID, or secret — the platform code reads them from the environment.

The issuer must use https. The only exception is a **loopback issuer** (localhost), which may use
plain http: it is how the E2E suite and local verification run against a mock identity provider —
the same localhost-only exception Entra applies to redirect URIs. Production issuers are always https.

### Client secret constraints

`OIDC_CLIENT_SECRET` is **owned by the portal**, not by the App:

- The App reads it from the environment only. **Never persist it** (database, files, caches) and **never log it**.
- It **can change between one restart and the next**: the portal rotates it automatically and guarantees a valid secret at every container start. Never copy it anywhere that outlives the process.

### Roles and authorization

The signed-in user's `roles` claim contains the **string `value`s declared in `roles.json`** (never GUIDs). The platform registers it as the role claim, so standard ASP.NET Core authorization works with those exact strings:

```csharp
group.MapDelete("/{id:guid}", DeleteContact)
     .RequireAuthorization(policy => policy.RequireRole("Contacts.Admin"));
```

In App code, reference these values through the `AppRoles` constants (`App/AppRoles.cs` in the backend, the generated `app-roles.generated.ts` in the frontend) instead of repeating the literals — see AGENT-CHECKLIST §4, row 8.

`GET /api/auth/me` exposes the same roles to the frontend for role-aware UI.

### Role declaration (`/app/iam/roles.json`)

The Docker image must include a file at `/app/iam/roles.json` containing the list of role names the App exposes:

```json
[
  {
    "value": "Contacts.Admin",
    "displayName": "Contacts Admin",
    "description": "Full access to contacts including deletion. Includes all Contacts.Writer permissions."
  },
  {
    "value": "Contacts.Writer",
    "displayName": "Contacts Writer",
    "description": "Can create and edit contacts, but cannot delete them."
  }
]
```

Each entry is a JSON object with three required fields:

| Field | Description |
|---|---|
| `value` | Machine-readable identifier used in the `roles` claims and as Entra App Role `value`. Use dot-notation (e.g. `Contacts.Admin`). |
| `displayName` | Human-readable name shown in the Entra portal and admin UIs. |
| `description` | A sentence describing what the role grants. |

Each `value` must match `^[A-Za-z][A-Za-z0-9._-]{0,63}$` — it starts with a letter, is at most 64 characters long, uses only letters, digits, `.`, `_`, `-`, and must be unique within the App. A `roles.json` violating these rules makes the deployment fail with an explicit reason.

- An empty array `[]` is valid if the App has no roles.
- The file must be placed at exactly `/app/iam/roles.json` inside the runtime image.

IntelliFlow reads this file at deploy time and synchronises the declared roles with the App's Entra App Registration. Roles present in Entra but absent from this file are **disabled** (not deleted).

The recommended location in the repository is `.intelliflow/iam/roles.json`. The Dockerfile must copy it to `/app/iam/roles.json` in the runtime stage:

```dockerfile
# In the runtime stage — already included in the app-template Dockerfile
COPY .intelliflow/iam/roles.json ./iam/roles.json
```

---

## Portal API access from the agent workspace

The only portal API the agent calls at development time is `GET /api/portal-capabilities` (catalog
and skill files) — a **plain HTTP GET, with no credential or header**. The portal does not broker Git
credentials: the agent authenticates Git and GitHub operations with the workspace's native GitHub
identity (see the `git-push` capability, `.intelliflow/capabilities/git-push.md`).

- **Reachability depends on the workspace.** The portal must be reachable over the network from the
  agent's environment for these calls to succeed; a workspace with no route to the portal cannot use
  them.
- **Portal unreachable or a call failed (network error or non-2xx status):** report to the Creator
  that the portal APIs are not available from this workspace and continue with the local files only.
  Do not search for other credentials and do not improvise a fallback.

---

## Observability (OTel)

IntelliFlow injects standard OTel environment variables (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME`, etc.). The OTel setup in the App (traces, metrics, logs) must not be removed or altered: it is the channel through which IntelliFlow monitors the App.
