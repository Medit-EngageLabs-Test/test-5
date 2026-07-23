using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace App.Platform;

/// <summary>
/// IntelliFlow platform authentication: a BFF (encrypted HttpOnly session cookie + OIDC code
/// flow as a confidential client) wired from the portal contract environment variables
/// <c>OIDC_ISSUER</c>, <c>OIDC_CLIENT_ID</c>, <c>OIDC_CLIENT_SECRET</c>.
///
/// This is PLATFORM CODE owned by IntelliFlow — do not modify, remove, or work around it.
/// See <c>.intelliflow/portal-contracts/core.md</c>.
/// </summary>
public static class PlatformAuthentication
{
    // Portal contract environment variables (core.md → "Environment variables injected by IntelliFlow").
    private const string IssuerVariable = "OIDC_ISSUER";
    private const string ClientIdVariable = "OIDC_CLIENT_ID";
    private const string ClientSecretVariable = "OIDC_CLIENT_SECRET";

    // JWT claim types read from the session (MapInboundClaims is off, so they keep their raw names).
    private const string RolesClaim = "roles";
    private const string NameClaim = "name";
    private const string ObjectIdClaim = "oid";
    private const string SubjectClaim = "sub";
    private const string EmailClaim = "email";

    // Paths reachable without a session: the portal health probe and the login entry point.
    // The OIDC callback paths are handled by the authentication middleware before the gate runs.
    private static readonly PathString HealthPath = new("/health");
    private static readonly PathString LoginPath = new("/api/auth/login");
    private static readonly PathString ApiPrefix = new("/api");

    // EventIds are in a dedicated 9xxx range so platform log records never collide with the App's own.
    private static readonly Action<ILogger, Exception?> _authenticationDisabled =
        LoggerMessage.Define(
            LogLevel.Warning,
            new EventId(9001, "PlatformAuthenticationDisabled"),
            "OIDC_ISSUER is not set: the App is running WITHOUT authentication. " +
            "This is expected in local development and CI only — in production IntelliFlow " +
            "always injects the OIDC contract for registered Apps.");

    private static readonly Action<ILogger, Exception?> _authenticationEnabled =
        LoggerMessage.Define(
            LogLevel.Information,
            new EventId(9002, "PlatformAuthenticationEnabled"),
            "Platform authentication enabled: BFF session cookie + OIDC code flow.");

    /// <summary>
    /// Registers the BFF authentication (session cookie + OIDC code flow) and the authenticated
    /// fallback policy when the OIDC portal contract is present in the environment.
    /// Without <c>OIDC_ISSUER</c> the App runs unauthenticated — local development and CI only:
    /// in production IntelliFlow always injects the contract for registered Apps.
    /// </summary>
    /// <param name="builder">The application builder to configure.</param>
    /// <returns>The same <see cref="WebApplicationBuilder"/> for chaining.</returns>
    /// <exception cref="InvalidOperationException">
    /// <c>OIDC_ISSUER</c> is set but <c>OIDC_CLIENT_ID</c> or <c>OIDC_CLIENT_SECRET</c> is missing:
    /// the OIDC contract is incomplete and the App would fail only at the first sign-in attempt.
    /// </exception>
    public static WebApplicationBuilder AddPlatformAuthentication(this WebApplicationBuilder builder)
    {
        // The App always runs behind IntelliFlow's TLS-terminating reverse proxy (Traefik), which
        // forwards over plain HTTP internally. Honour X-Forwarded-Proto so Request.Scheme reflects
        // the original https: without it the OIDC handler builds an http redirect_uri that never
        // matches the https one the portal registers in Entra, and every sign-in fails.
        builder.Services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedFor;
            // Only the trusted proxy can reach the App, so accept its forwarded headers.
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
        });

        if (!IsConfigured(builder.Configuration))
        {
            // No OIDC contract (local dev / CI): run without authentication. The auth services are
            // still registered — with no fallback policy — so an endpoint that opts into
            // authorization (per core.md) degrades to 401 instead of crashing the request pipeline.
            // There is no identity provider to sign in against in this mode.
            builder.Services
                .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
                .AddCookie();
            builder.Services.AddAuthorization();
            return builder;
        }

        var issuer = builder.Configuration[IssuerVariable];
        var clientId = builder.Configuration[ClientIdVariable];
        var clientSecret = builder.Configuration[ClientSecretVariable];
        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            throw new InvalidOperationException(
                $"{IssuerVariable} is set but {ClientIdVariable}/{ClientSecretVariable} is missing: " +
                "the OIDC portal contract is incomplete. IntelliFlow injects all three together — " +
                "fail loudly at startup rather than at the first sign-in.");

        builder.Services
            .AddAuthentication(options =>
            {
                options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
                // Unauthenticated page loads challenge OIDC directly: arriving from the portal
                // with an active Entra session, the round-trip completes as a silent SSO.
                options.DefaultChallengeScheme = OpenIdConnectDefaults.AuthenticationScheme;
            })
            .AddCookie(options =>
            {
                options.Cookie.HttpOnly = true;
                // Behind the TLS-terminating proxy the App speaks HTTP internally: force Secure
                // unconditionally so the session cookie is never emitted without the flag.
                options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
                options.Cookie.SameSite = SameSiteMode.Lax;
                // BFF contract: a role-authorization failure surfaces as a status code,
                // never as a redirect to an access-denied page the SPA cannot render.
                options.Events.OnRedirectToAccessDenied = context =>
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    return Task.CompletedTask;
                };
            })
            .AddOpenIdConnect(options =>
            {
                options.Authority = issuer;
                // https is mandatory for every real issuer; only a loopback issuer (the mock
                // identity provider used by E2E tests and local verification) may use plain http —
                // the same localhost-only exception Entra itself applies to redirect URIs.
                options.RequireHttpsMetadata = !IsLoopbackIssuer(issuer);
                options.ClientId = clientId;
                options.ClientSecret = clientSecret;
                options.ResponseType = "code";
                // The App never calls the identity provider on the user's behalf: the session
                // cookie is the only credential kept, tokens are dropped after sign-in.
                options.SaveTokens = false;
                options.MapInboundClaims = false;
                // Authorization uses the role values declared in roles.json, carried verbatim by
                // the "roles" claim — [Authorize(Roles = "...")] works with those exact strings.
                options.TokenValidationParameters.RoleClaimType = RolesClaim;
                options.TokenValidationParameters.NameClaimType = NameClaim;
                options.CallbackPath = "/api/auth/callback";
                options.SignedOutCallbackPath = "/api/auth/logout-callback";
                options.Scope.Clear();
                options.Scope.Add("openid");
                options.Scope.Add("profile");
                options.Scope.Add("email");
                // API requests surface 401 instead of a redirect to the identity provider;
                // the explicit /api/auth/login entry point is the one API path allowed to redirect.
                options.Events = new OpenIdConnectEvents
                {
                    OnRedirectToIdentityProvider = context =>
                    {
                        if (context.Request.Path.StartsWithSegments(ApiPrefix)
                            && !context.Request.Path.StartsWithSegments(LoginPath))
                        {
                            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                            context.HandleResponse();
                        }

                        return Task.CompletedTask;
                    },
                };
            });

        // Secure by default: every endpoint requires an authenticated session unless it opts
        // out explicitly (/health for the portal probe, /api/auth/login as the entry point).
        // No bearer scheme is registered: Apps do not accept bearer tokens by design.
        builder.Services.AddAuthorization(options =>
            options.FallbackPolicy = new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser()
                .Build());

        return builder;
    }

    /// <summary>
    /// Adds the authentication middleware, gates the SPA static files (served before endpoint
    /// routing, they would otherwise bypass the fallback policy) and maps the platform auth
    /// endpoints <c>GET /api/auth/login</c>, <c>POST /api/auth/logout</c>, <c>GET /api/auth/me</c>.
    /// Call it before <c>UseDefaultFiles</c>/<c>UseStaticFiles</c>.
    /// No-op (with a warning) when the OIDC portal contract is absent from the environment.
    /// </summary>
    /// <param name="app">The application to configure.</param>
    /// <returns>The same <see cref="WebApplication"/> for chaining.</returns>
    public static WebApplication UsePlatformAuthentication(this WebApplication app)
    {
        // Must run before any middleware that inspects the request scheme (authentication, cookie
        // emission) so Request.Scheme is the proxy's original https, not the internal http.
        app.UseForwardedHeaders();

        if (!IsConfigured(app.Configuration))
        {
            _authenticationDisabled(app.Logger, null);
            return app;
        }

        _authenticationEnabled(app.Logger, null);

        app.UseAuthentication();

        // Static files are served before endpoint routing: without this gate the SPA bundle
        // (and every file under wwwroot) would bypass the authenticated fallback policy.
        app.Use(async (context, next) =>
        {
            if (IsAnonymousPath(context.Request.Path) || context.User.Identity?.IsAuthenticated == true)
            {
                await next();
                return;
            }

            if (context.Request.Path.StartsWithSegments(ApiPrefix))
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return;
            }

            // Unauthenticated page load: challenge OIDC, returning to the requested page.
            // The return URL is validated: a crafted path (e.g. "//evil.com") must not turn
            // the post-login redirect into an open redirector.
            var returnUrl = context.Request.Path + context.Request.QueryString;
            await context.ChallengeAsync(
                OpenIdConnectDefaults.AuthenticationScheme,
                new AuthenticationProperties { RedirectUri = IsLocalReturnUrl(returnUrl) ? returnUrl : "/" });
        });

        app.UseAuthorization();

        MapAuthEndpoints(app);
        return app;
    }

    private static bool IsConfigured(IConfiguration configuration) =>
        !string.IsNullOrWhiteSpace(configuration[IssuerVariable]);

    // Loopback issuers (localhost, 127.0.0.1, [::1]) are the only ones allowed over plain http:
    // a malformed issuer is treated as non-loopback, so https stays required and the OIDC
    // handler surfaces the configuration error itself.
    private static bool IsLoopbackIssuer(string? issuer) =>
        Uri.TryCreate(issuer, UriKind.Absolute, out var issuerUri) && issuerUri.IsLoopback;

    private static bool IsAnonymousPath(PathString path) =>
        path.StartsWithSegments(HealthPath) || path.StartsWithSegments(LoginPath);

    // Accepts only same-site absolute paths ("/apps", "/"), rejecting protocol-relative and
    // backslash-smuggled forms ("//evil.com", "/\evil.com") that browsers resolve as external.
    private static bool IsLocalReturnUrl(string? url) =>
        !string.IsNullOrEmpty(url)
        && url[0] == '/'
        && (url.Length == 1 || (url[1] != '/' && url[1] != '\\'));

    private static void MapAuthEndpoints(WebApplication app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Auth");

        // Interactive login entry point. Anonymous by definition; only same-site return URLs
        // are honoured so the endpoint cannot be used as an open redirector.
        group.MapGet("/login", (string? returnUrl) =>
            Results.Challenge(
                new AuthenticationProperties { RedirectUri = IsLocalReturnUrl(returnUrl) ? returnUrl! : "/" },
                [OpenIdConnectDefaults.AuthenticationScheme]))
            .AllowAnonymous();

        // Requires the session cookie (fallback policy): a cross-site force-logout carries no
        // SameSite=Lax cookie and is rejected with 401 instead of clearing the victim's session.
        group.MapPost("/logout", () =>
            Results.SignOut(
                new AuthenticationProperties { RedirectUri = "/" },
                [CookieAuthenticationDefaults.AuthenticationScheme, OpenIdConnectDefaults.AuthenticationScheme]));

        // The authenticated user's identity and App roles (the roles.json values), for
        // role-aware UIs. Reads the session cookie only — no identity provider round-trip.
        group.MapGet("/me", (ClaimsPrincipal user) => Results.Ok(new
        {
            oid = user.FindFirstValue(ObjectIdClaim) ?? user.FindFirstValue(SubjectClaim),
            displayName = user.FindFirstValue(NameClaim),
            email = user.FindFirstValue(EmailClaim),
            roles = user.FindAll(RolesClaim).Select(claim => claim.Value).ToArray(),
        }));
    }
}
