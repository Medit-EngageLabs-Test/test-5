using System.Net;

namespace App.Tests;

/// <summary>
/// Verifies the "open mode" the App runs in when the OIDC portal contract is absent from the
/// environment — local development and CI only (core.md "IAM"; App.Platform logs a startup
/// warning). This is the premise the local development bypass builds on (iam capability): the App
/// is reachable without an identity provider and reads need no session.
///
/// End-to-end verification for the hardening group (AB#13585): the local-development leg. The
/// production-mode counterpart — the same endpoint refusing an anonymous caller with the OIDC
/// contract present — lives in <see cref="AuthenticationTests"/>; the base <see cref="AppFactory"/>
/// sets no OIDC variables, so it boots the App exactly as a developer runs it locally.
/// </summary>
public class OpenModeAuthenticationTests(AppFactory factory) : IClassFixture<AppFactory>
{
    [Fact]
    public async Task GetTasks_InOpenMode_Returns200WithoutASession()
    {
        // With the OIDC contract present this same call returns 401 (AuthenticationTests): open
        // mode is what makes the App runnable locally without an identity provider.
        var client = factory.CreateClient();

        var response = await client.GetAsync("/api/tasks");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
