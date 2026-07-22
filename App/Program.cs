using App;
using App.Contacts;
using App.Platform;
using Microsoft.EntityFrameworkCore;
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

app.MapContacts();

// Serve Angular SPA for all unmatched routes
app.MapFallbackToFile("index.html");

app.Run();
