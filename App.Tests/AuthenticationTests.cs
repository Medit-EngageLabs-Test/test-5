using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;

namespace App.Tests;

/// <summary>
/// Boots the App with the OIDC portal contract present in the environment, as in production.
/// The identity provider is never contacted: a static OIDC configuration replaces the metadata
/// discovery, so these tests exercise only the BFF gate — anonymous health probe, 401 for API
/// calls without a session, bearer tokens rejected, unauthenticated pages challenged.
/// </summary>
public sealed class AuthenticatedAppFactory : AppFactory
{
    /// <summary>The fake identity provider authority injected as <c>OIDC_ISSUER</c>.</summary>
    public const string Issuer = "https://tests.ciamlogin.com/00000000-0000-0000-0000-000000000000/v2.0";

    /// <summary>The authorization endpoint unauthenticated page loads must be redirected to.</summary>
    public const string AuthorizationEndpoint = "https://tests.ciamlogin.com/oauth2/v2.0/authorize";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);

        builder.UseSetting("OIDC_ISSUER", Issuer);
        builder.UseSetting("OIDC_CLIENT_ID", "00000000-0000-0000-0000-000000000001");
        builder.UseSetting("OIDC_CLIENT_SECRET", "test-only-secret");

        // Static OIDC configuration: no metadata discovery over the network. The standard
        // post-configuration has already built a metadata-based ConfigurationManager by the
        // time this runs, so the static manager must be set explicitly.
        builder.ConfigureServices(services =>
            services.PostConfigure<OpenIdConnectOptions>(OpenIdConnectDefaults.AuthenticationScheme, options =>
                options.ConfigurationManager = new StaticConfigurationManager<OpenIdConnectConfiguration>(
                    new OpenIdConnectConfiguration
                    {
                        Issuer = Issuer,
                        AuthorizationEndpoint = AuthorizationEndpoint,
                        TokenEndpoint = "https://tests.ciamlogin.com/oauth2/v2.0/token",
                        EndSessionEndpoint = "https://tests.ciamlogin.com/oauth2/v2.0/logout",
                    })));
    }
}

public class AuthenticationTests(AuthenticatedAppFactory factory) : IClassFixture<AuthenticatedAppFactory>
{
    private HttpClient CreateClient() =>
        factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    [Fact]
    public async Task GetHealth_WithoutSession_Returns200()
    {
        var client = CreateClient();

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        Assert.Equal("healthy", JsonDocument.Parse(body).RootElement.GetProperty("status").GetString());
    }

    [Fact]
    public async Task ApiRequest_WithoutSession_Returns401()
    {
        var client = CreateClient();

        var response = await client.GetAsync("/api/contacts");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ApiRequest_WithBearerToken_Returns401()
    {
        // Apps do not accept bearer tokens (core.md): no bearer scheme is registered,
        // so even a well-formed Authorization header must not open a session.
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer", "eyJhbGciOiJub25lIn0.eyJzdWIiOiJhdHRhY2tlciJ9.");

        var response = await client.GetAsync("/api/contacts");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task PageRequest_WithoutSession_RedirectsToIdentityProvider()
    {
        // The SPA (static files) must not be served to anonymous users: the BFF gate
        // challenges OIDC, which redirects to the identity provider's authorize endpoint.
        var client = CreateClient();

        var response = await client.GetAsync("/");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.NotNull(response.Headers.Location);
        Assert.StartsWith(
            AuthenticatedAppFactory.AuthorizationEndpoint,
            response.Headers.Location.AbsoluteUri,
            StringComparison.Ordinal);
    }

    [Fact]
    public async Task LoginEndpoint_WithoutSession_RedirectsToIdentityProvider()
    {
        var client = CreateClient();

        var response = await client.GetAsync("/api/auth/login");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.NotNull(response.Headers.Location);
        Assert.StartsWith(
            AuthenticatedAppFactory.AuthorizationEndpoint,
            response.Headers.Location.AbsoluteUri,
            StringComparison.Ordinal);
    }

    [Fact]
    public async Task LogoutEndpoint_WithoutSession_Returns401()
    {
        // A cross-site force-logout carries no SameSite=Lax cookie: it must be rejected,
        // not clear the victim's session.
        var client = CreateClient();

        var response = await client.PostAsync("/api/auth/logout", content: null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public void HttpsIssuer_RequiresHttpsMetadata()
    {
        var options = factory.Services.GetRequiredService<IOptionsMonitor<OpenIdConnectOptions>>()
            .Get(OpenIdConnectDefaults.AuthenticationScheme);

        Assert.True(options.RequireHttpsMetadata);
    }
}

/// <summary>
/// Boots the App with a loopback http issuer, as when the OIDC portal contract points at the
/// local mock identity provider (E2E tests, local verification).
/// </summary>
public sealed class LoopbackIssuerAppFactory : AppFactory
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);

        builder.UseSetting("OIDC_ISSUER", "http://localhost:4011");
        builder.UseSetting("OIDC_CLIENT_ID", "00000000-0000-0000-0000-000000000001");
        builder.UseSetting("OIDC_CLIENT_SECRET", "test-only-secret");
    }
}

public class LoopbackIssuerAuthenticationTests(LoopbackIssuerAppFactory factory) : IClassFixture<LoopbackIssuerAppFactory>
{
    [Fact]
    public void LoopbackHttpIssuer_DoesNotRequireHttpsMetadata()
    {
        // Only loopback issuers may use plain http (mirrors Entra's own localhost redirect-URI
        // exception): the metadata requirement must relax without any dedicated switch.
        var options = factory.Services.GetRequiredService<IOptionsMonitor<OpenIdConnectOptions>>()
            .Get(OpenIdConnectDefaults.AuthenticationScheme);

        Assert.False(options.RequireHttpsMetadata);
    }
}
