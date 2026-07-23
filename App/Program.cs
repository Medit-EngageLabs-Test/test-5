using System.Text.Json.Serialization;
using Amazon.S3;
using App;
using App.Board;
using App.Platform;
using App.Realtime;
using App.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OpenTelemetry.Logs;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

var builder = WebApplication.CreateBuilder(args);

// ── Database ──────────────────────────────────────────────────────────────────
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Database")));

// ── OpenTelemetry ─────────────────────────────────────────────────────────────
builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r.AddService(
        serviceName: builder.Environment.ApplicationName,
        serviceVersion: typeof(Program).Assembly.GetName().Version?.ToString() ?? "0.0.0"))
    .WithTracing(t => t
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddSource("Npgsql")             // traces every SQL query sent to PostgreSQL
        .AddOtlpExporter())
    .WithMetrics(m => m
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddRuntimeInstrumentation()
        .AddOtlpExporter());

builder.Logging.AddOpenTelemetry(o =>
{
    o.IncludeFormattedMessage = true;
    o.IncludeScopes = true;      // propagates Trace/Span IDs into every log record
    o.AddOtlpExporter();
});

// ── API ───────────────────────────────────────────────────────────────────────
builder.Services.AddEndpointsApiExplorer();

// Board Status/Urgency serialize as their names ("ToDo", "High"), not numbers: keeps the wire
// contract exact-identifier and lets the frontend model be a string union instead of magic ints.
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

// ── Board ─────────────────────────────────────────────────────────────────────
builder.Services.AddScoped<IUserProvisioningService, UserProvisioningService>();

// ── Real-time (F6, ticket #23 — ADR-0001) ──────────────────────────────────────
// Registers IHubContext<BoardHub, IBoardClient> for the Board endpoints to broadcast through,
// and the services BoardHub itself needs. No backplane: single instance (ADR-0001).
builder.Services.AddSignalR();

// ── Storage (S3-compatible bucket, storage capability) ────────────────────────
// The six Storage__* variables have no fallback (portal contract): a missing one
// must fail App startup, not silently default to a local endpoint.
builder.Services.AddOptions<StorageOptions>()
    .BindConfiguration("Storage")
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddSingleton<IAmazonS3>(serviceProvider =>
{
    var options = serviceProvider.GetRequiredService<IOptions<StorageOptions>>().Value;
    var config = new AmazonS3Config
    {
        ServiceURL = options.Endpoint,
        ForcePathStyle = true, // shared store (MinIO / managed S3-compatible) is addressed path-style
        AuthenticationRegion = options.Region,
    };
    return new AmazonS3Client(options.AccessKey, options.SecretKey, config);
});

builder.Services.AddSingleton<IObjectStore, S3ObjectStore>();

// ── Authentication (IntelliFlow platform code — do not modify) ────────────────
// BFF session cookie + OIDC code flow, active when IntelliFlow injects the OIDC
// environment contract — see .intelliflow/portal-contracts/core.md.
builder.AddPlatformAuthentication();

var app = builder.Build();

// ── Migrations ────────────────────────────────────────────────────────────────
// IntelliFlow applies migrations before starting the container.
// Do NOT call Database.MigrateAsync() here — see .intelliflow/portal-contracts/core.md.

// ── Middleware ────────────────────────────────────────────────────────────────
// Platform authentication must run before the static files middleware, so the SPA
// is served only to authenticated sessions (IntelliFlow platform code — do not modify).
app.UsePlatformAuthentication();
app.UseDefaultFiles();
app.UseStaticFiles();

// ── Endpoints ────────────────────────────────────────────────────────────────
app.MapGet("/health", () => Results.Ok(new { status = "healthy" }))
   .WithTags("Health")
   .AllowAnonymous(); // portal health probe — must stay anonymous (core.md)

app.MapTasks();
app.MapComments();
app.MapAttachments();

// Real-time Board hub (F6, ticket #23). Mapped under /api — not platform wiring, added after it
// without modifying it — so it inherits the exact same gating every other /api endpoint gets from
// the platform's authenticated FallbackPolicy/open-mode absence of one (see BoardHub's own doc).
app.MapHub<BoardHub>("/api/hubs/board");

// Serve Angular SPA for all unmatched routes
app.MapFallbackToFile("index.html");

app.Run();
