using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace App.Tests;

/// <summary>
/// Boots the App with a test-only authentication scheme: each request authenticates as a user
/// whose roles come from the <see cref="RolesHeader"/> header (comma-separated roles.json values);
/// without the header the request stays anonymous. This is how endpoint authorization — the
/// roles.json ↔ code alignment required by the portal contract — is exercised without an identity
/// provider. Test infrastructure only: the App itself ships no bypass code.
/// </summary>
public sealed class RoleAuthenticatedAppFactory : AppFactory
{
    /// <summary>The name of the test authentication scheme.</summary>
    public const string SchemeName = "TestRoles";

    /// <summary>Request header carrying the comma-separated roles of the test user.</summary>
    public const string RolesHeader = "X-Test-Roles";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);

        builder.ConfigureServices(services =>
            services.AddAuthentication(options =>
                {
                    options.DefaultAuthenticateScheme = SchemeName;
                    options.DefaultChallengeScheme = SchemeName;
                })
                .AddScheme<AuthenticationSchemeOptions, TestRolesAuthenticationHandler>(SchemeName, _ => { }));
    }
}

/// <summary>
/// Authenticates a request from the <see cref="RoleAuthenticatedAppFactory.RolesHeader"/> header:
/// header absent → anonymous (401 on challenge); header present → authenticated test user carrying
/// one role claim per listed value (403 on forbid when the endpoint requires a missing role).
/// </summary>
file sealed class TestRolesAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Headers.TryGetValue(RoleAuthenticatedAppFactory.RolesHeader, out var rolesHeader))
            return Task.FromResult(AuthenticateResult.NoResult());

        var claims = new List<Claim> { new(ClaimTypes.Name, "test-user") };
        claims.AddRange(rolesHeader.ToString()
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(role => new Claim(ClaimTypes.Role, role)));

        var identity = new ClaimsIdentity(claims, Scheme.Name);
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name);
        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
