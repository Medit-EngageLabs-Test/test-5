# Capability: S3-Compatible Storage

Version: 2026-07-21

This App is given a dedicated folder inside a shared S3-compatible bucket provisioned by IntelliFlow. The bucket name, the folder, and the credentials are injected as environment variables at deploy time. Confine all your object keys to your folder.

This file is the **complete activation recipe**: the scaffold ships bare, and every artifact below is the agent's to add. Two ways in:

- **Activating the capability** (first time) → apply the Activation steps.
- **Re-invoking the installed skill** → run the compliance and update checks at the bottom.

---

## Guardrails — always respect these constraints

### Environment variables

IntelliFlow injects the following environment variables into the container at deploy time. Do not hardcode these values:

| Variable | Description |
|---|---|
| `Storage__Endpoint` | S3-compatible endpoint URL (e.g. `http://minio:9000` or the managed store's S3 endpoint) |
| `Storage__BucketName` | Name of the shared bucket. It is shared with other Apps — never treat it as yours alone |
| `Storage__Folder` | The folder reserved for this App. Prefix every object key with `{Storage__Folder}/` |
| `Storage__AccessKey` | Access key for the shared bucket |
| `Storage__SecretKey` | Secret key for the shared bucket |
| `Storage__Region` | AWS region (use `us-east-1` for MinIO unless the Operator specifies otherwise) |

You may keep local values in `appsettings.Development.json` for development; they are ignored in production.

### SDK

Use `AWSSDK.S3` (the official Amazon NuGet package) to interact with the bucket. Do not use other S3 client libraries.

Configure the client by reading from the environment variables above — never hardcode endpoint, credentials, or bucket name. Set `ForcePathStyle = true` on the `AmazonS3Config`: the shared store (MinIO, and managed S3-compatible stores) is addressed path-style.

### Folder discipline

Your storage lives under the prefix `{Storage__Folder}/` inside the shared bucket. Every key you read or write **must** start with that prefix — e.g. write to `{Storage__Folder}/reports/2026.csv`, not `reports/2026.csv`. Do not read from or write to any other prefix, and do not list or touch objects outside your folder: other Apps' data lives in sibling folders in the same bucket. The folder boundary is a convention IntelliFlow relies on you to honour, not a wall — staying inside it is your responsibility.

### Bucket lifecycle

IntelliFlow provisions your folder before starting the container, and the shared bucket already exists. **Do not call `PutBucketAsync`, `CreateBucketAsync`, or any other bucket-creation API from App code.** Your App must assume the bucket and your folder already exist and are ready when it starts. (In development the shared bucket is created once from outside the App — see Activation step 2; the folder itself is just a key prefix and needs no creation.)

### No fallback values

The storage configuration variables must not have hardcoded fallbacks. If a variable is missing, the App must fail to start with a clear error — do not silently fall back to a local default (e.g. `?? "http://localhost:9000"`). Use `builder.Configuration["Storage:Endpoint"] ?? throw new InvalidOperationException(...)` or bind via `IOptions` with `ValidateOnStart()`.

---

## Activation — the agent applies every step

Apply the steps in order. Each step is **idempotent**: if the repository already contains the artifact (added by a previous session or an older scaffold), verify it matches and move on. Activation is complete when every box of the step-6 compliance check is checked.

### 1. Declare the capability

- Save this file at `.intelliflow/capabilities/storage.md`.
- Create the skill stub `.claude/skills/storage.md` so the checks below are invocable as a skill:

  ```markdown
  ---
  name: storage
  description: S3-compatible storage capability of this App. Use when working with files, uploads, attachments, buckets, or S3/MinIO configuration.
  ---

  Read `.intelliflow/capabilities/storage.md` and run the compliance and update checks documented in that file.
  ```

- Add a `storage` line to `.intelliflow/services` — the provisioning manifest IntelliFlow reads from the Docker image to know what to provision before starting the container.

### 2. Development infrastructure (`docker-compose.dev.yml`)

Add the `storage` service:

```yaml
  storage:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio123
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - miniodata:/data
```

Register `miniodata:` under the top-level `volumes:` key.

Then create the development bucket **from outside the App** (the bucket-lifecycle guardrail forbids bucket creation in App code, not in this one-off setup). In development the App works inside a folder of this single bucket, exactly as it will in production:

```bash
docker compose -f docker-compose.dev.yml up -d storage
docker compose -f docker-compose.dev.yml exec storage sh -c \
  'until mc alias set local http://localhost:9000 minio minio123 2>/dev/null; do sleep 1; done; mc mb --ignore-existing local/app-dev'
```

### 3. Local configuration (`App/appsettings.Development.json`)

Add the `Storage` block, matching the development MinIO above. `Folder` is the App's prefix inside the shared bucket:

```json
"Storage": {
  "Endpoint": "http://localhost:9000",
  "BucketName": "app-dev",
  "Folder": "app",
  "AccessKey": "minio",
  "SecretKey": "minio123",
  "Region": "us-east-1"
}
```

The `Storage` block lives in `appsettings.Development.json` only: in production the App reads the injected environment variables and must fail fast when they are missing (see Guardrails).

### 4. SDK package

```bash
dotnet add App/App.csproj package AWSSDK.S3
```

Register the S3 client reading endpoint, credentials, bucket, folder and region from configuration — no fallbacks (see Guardrails). Bind a `Folder` property alongside the rest and prefix every object key with it (see Folder discipline). The decision-rich parts:

```csharp
builder.Services.AddOptions<StorageOptions>()
    .BindConfiguration("Storage")
    .ValidateDataAnnotations()   // every property [Required]
    .ValidateOnStart();

builder.Services.AddSingleton<IAmazonS3>(serviceProvider =>
{
    var options = serviceProvider.GetRequiredService<IOptions<StorageOptions>>().Value;
    var config = new AmazonS3Config
    {
        ServiceURL = options.Endpoint,
        ForcePathStyle = true,   // shared store (MinIO / managed S3-compatible) is addressed path-style
        AuthenticationRegion = options.Region,
    };
    return new AmazonS3Client(options.AccessKey, options.SecretKey, config);
});
```

### 5. CI environment (`.github/workflows/build.yml`)

The pipeline starts the App (health check + E2E) without a real bucket. In the step that runs the backend (`Start backend (background)`), add these variables alongside the existing `env:` entries:

```yaml
          # Storage capability: no-fallback config requires values at startup.
          # Placeholders suffice as long as E2E do not exercise storage paths.
          Storage__Endpoint: http://localhost:9000
          Storage__BucketName: ci-placeholder
          Storage__Folder: ci
          Storage__AccessKey: ci
          Storage__SecretKey: ci-secret
          Storage__Region: us-east-1
```

If your E2E tests **do** exercise storage paths, placeholders are not enough: run a real MinIO in the workflow (a GitHub Actions `services:` block, or the compose file) and point these variables at it.

### 6. Compliance check

- [ ] The six `Storage__*` values (see Guardrails) are read exclusively from configuration/environment — no hardcoded values, no `?? "fallback"` defaults
- [ ] Every object key is prefixed with `{Storage__Folder}/` — no read, write, or list touches a key outside the App's folder
- [ ] The S3 client is configured using `AWSSDK.S3` with `ForcePathStyle = true` — no other S3 library is used
- [ ] No direct HTTP calls to the MinIO/S3 endpoint outside of the `AWSSDK.S3` client
- [ ] No bucket-creation code (`PutBucketAsync`, `CreateBucketAsync`, `EnsureBucketExists`, or equivalent) anywhere in App code
- [ ] This file exists at `.intelliflow/capabilities/storage.md` and the stub `.claude/skills/storage.md` points to it
- [ ] `storage` appears in `.intelliflow/services`
- [ ] `docker-compose.dev.yml` contains the `storage` service and the `miniodata` volume
- [ ] `App/appsettings.Development.json` contains the `Storage` block (including `Folder`); `App/appsettings.json` does not
- [ ] The CI step that starts the App exports the six `Storage__*` variables

---

## When this skill is invoked

Run the compliance check (Activation step 6) and the update check below; report both outcomes to the Creator.

### Capability update check

1. Read the installed version: the `Version` line at the top of this file.
2. Call `GET {intelliflow_url}/api/portal-capabilities/storage/skill` (URL from `.intelliflow/config`) — a plain HTTP GET, no credential or header. If the portal is unreachable or the call fails, report to the Creator that the portal APIs are not available from this workspace and skip this check — do not improvise a fallback.
3. If the remote version is newer: overwrite this file, re-apply the Activation steps whose content changed, re-run the compliance check, and report the update — including any breaking changes — to the Creator at the next hand-off.
