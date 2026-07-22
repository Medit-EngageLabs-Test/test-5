using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace App.Tests;

/// <summary>
/// Verifies that the Contacts demo enforces exactly the roles declared in roles.json
/// (portal contract, core.md "Roles and authorization"): Contacts.Writer creates and edits
/// but cannot delete; Contacts.Admin has full access including deletion. This is the
/// "roles.json matches the code" release check, in both directions, as executable tests.
/// </summary>
public class ContactsAuthorizationTests(RoleAuthenticatedAppFactory factory) : IClassFixture<RoleAuthenticatedAppFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private HttpClient CreateClientWithRoles(params string[] roles)
    {
        var client = factory.CreateClient();
        if (roles.Length > 0)
            client.DefaultRequestHeaders.Add(RoleAuthenticatedAppFactory.RolesHeader, string.Join(",", roles));
        return client;
    }

    private static object ContactPayload(string firstName, string lastName) => new
    {
        firstName,
        lastName,
        email = (string?)null,
        phone = (string?)null,
        company = (string?)null,
        role = (string?)null,
    };

    private async Task<Guid> CreateContactAsAdminAsync()
    {
        var admin = CreateClientWithRoles(AppRoles.ContactsAdmin);
        var response = await admin.PostAsJsonAsync("/api/contacts", ContactPayload("Authz", "Fixture"));
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        return body.GetProperty("id").GetGuid();
    }

    [Fact]
    public async Task CreateContact_WithoutAuthentication_Returns401()
    {
        var anonymous = CreateClientWithRoles();

        var response = await anonymous.PostAsJsonAsync("/api/contacts", new { firstName = "No", lastName = "Auth" });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task CreateContact_WithWriterRole_Returns201()
    {
        var writer = CreateClientWithRoles(AppRoles.ContactsWriter);

        var response = await writer.PostAsJsonAsync("/api/contacts", ContactPayload("Writer", "Creates"));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
    }

    [Fact]
    public async Task UpdateContact_WithWriterRole_Returns200()
    {
        // roles.json: Contacts.Writer "can create and edit contacts".
        var id = await CreateContactAsAdminAsync();
        var writer = CreateClientWithRoles(AppRoles.ContactsWriter);

        var response = await writer.PutAsJsonAsync($"/api/contacts/{id}", ContactPayload("Writer", "Edits"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task UpdateContact_WithAdminRole_Returns200()
    {
        // roles.json: Contacts.Admin "includes all Contacts.Writer permissions" — editing included.
        var id = await CreateContactAsAdminAsync();
        var admin = CreateClientWithRoles(AppRoles.ContactsAdmin);

        var response = await admin.PutAsJsonAsync($"/api/contacts/{id}", ContactPayload("Admin", "Edits"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task DeleteContact_WithoutAuthentication_Returns401()
    {
        var anonymous = CreateClientWithRoles();

        var response = await anonymous.DeleteAsync($"/api/contacts/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task DeleteContact_WithWriterRole_Returns403()
    {
        // roles.json: Contacts.Writer "can create and edit contacts, but cannot delete them".
        var id = await CreateContactAsAdminAsync();
        var writer = CreateClientWithRoles(AppRoles.ContactsWriter);

        var response = await writer.DeleteAsync($"/api/contacts/{id}");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task DeleteContact_WithAdminRole_Returns204()
    {
        var id = await CreateContactAsAdminAsync();
        var admin = CreateClientWithRoles(AppRoles.ContactsAdmin);

        var response = await admin.DeleteAsync($"/api/contacts/{id}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }
}
