using System.Net;
using System.Net.Http.Json;

namespace App.Tests;

/// <summary>
/// Verifies the "open mode" the App runs in when the OIDC portal contract is absent from the
/// environment — local development and CI only (core.md "IAM"; App.Platform logs a startup
/// warning). This is the premise the local development bypass builds on (iam capability): the App
/// is reachable without an identity provider and reads need no session, but role-gated endpoints
/// still refuse an anonymous caller — which is exactly why impersonating an operator vs a customer
/// locally needs the temporary bypass rather than coming for free.
///
/// End-to-end verification for the hardening group (AB#13585): the local-development leg. The
/// production-mode counterpart — the same endpoints refusing anonymous callers with the OIDC
/// contract present — lives in <see cref="AuthenticationTests"/>; the base <see cref="AppFactory"/>
/// sets no OIDC variables, so it boots the App exactly as a developer runs it locally.
/// </summary>
public class OpenModeAuthenticationTests(AppFactory factory) : IClassFixture<AppFactory>
{
    [Fact]
    public async Task GetContacts_InOpenMode_Returns200WithoutASession()
    {
        // With the OIDC contract present this same call returns 401 (AuthenticationTests): open
        // mode is what makes the App runnable locally without an identity provider.
        var client = factory.CreateClient();

        var response = await client.GetAsync("/api/contacts");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task CreateContact_InOpenMode_RefusesAnAnonymousCaller()
    {
        // Role-gated writes opt into authorization explicitly (RequireRole), and WebApplication
        // still wires the authorization middleware in open mode, so an anonymous caller is refused
        // with 401 even here. Exercising an operator-only path locally therefore requires the
        // temporary bypass to impersonate a declared role — it never comes for free.
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/contacts", new { firstName = "Open", lastName = "Mode" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
