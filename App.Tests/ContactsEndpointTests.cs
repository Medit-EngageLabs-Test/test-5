using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace App.Tests;

public class ContactsEndpointTests(RoleAuthenticatedAppFactory factory) : IClassFixture<RoleAuthenticatedAppFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    // CRUD behaviour is exercised as Contacts.Admin (full access per roles.json); the role
    // matrix itself — who can do what — is covered by ContactsAuthorizationTests.
    private HttpClient CreateClient()
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(RoleAuthenticatedAppFactory.RolesHeader, AppRoles.ContactsAdmin);
        return client;
    }

    private async Task<Guid> CreateTestContactAsync(HttpClient client, string firstName = "Mario", string lastName = "Rossi")
    {
        var response = await client.PostAsJsonAsync("/api/contacts", new
        {
            firstName,
            lastName,
            email = $"{firstName.ToLower()}.{lastName.ToLower()}@test.com",
            phone = (string?)null,
            company = (string?)null,
            role = (string?)null,
        });
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        return body.GetProperty("id").GetGuid();
    }

    [Fact]
    public async Task ListContacts_ReturnsEmptyArray_WhenNoContactsExist()
    {
        var client = CreateClient();

        var response = await client.GetAsync("/api/contacts");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var contacts = await response.Content.ReadFromJsonAsync<JsonElement[]>();
        Assert.NotNull(contacts);
    }

    [Fact]
    public async Task CreateContact_Returns201WithCreatedContact()
    {
        var client = CreateClient();

        var response = await client.PostAsJsonAsync("/api/contacts", new
        {
            firstName = "Luca",
            lastName = "Bianchi",
            email = "luca.bianchi@test.com",
            phone = "0211234567",
            company = "Acme",
            role = "Developer",
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var contact = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        Assert.Equal("Luca", contact.GetProperty("firstName").GetString());
        Assert.Equal("Bianchi", contact.GetProperty("lastName").GetString());
        Assert.NotEqual(Guid.Empty, contact.GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task GetContact_ReturnsContact_WhenExists()
    {
        var client = CreateClient();
        var id = await CreateTestContactAsync(client, "Anna", "Verdi");

        var response = await client.GetAsync($"/api/contacts/{id}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var contact = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        Assert.Equal(id, contact.GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task GetContact_Returns404_WhenNotFound()
    {
        var client = CreateClient();

        var response = await client.GetAsync($"/api/contacts/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task ListContacts_ReturnsFilteredResults_WhenQueryProvided()
    {
        var client = CreateClient();
        await CreateTestContactAsync(client, "Cerca", "Questo");

        var response = await client.GetAsync("/api/contacts?q=Cerca");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var contacts = await response.Content.ReadFromJsonAsync<JsonElement[]>(JsonOptions);
        Assert.NotNull(contacts);
        Assert.Contains(contacts, c => c.GetProperty("firstName").GetString() == "Cerca");
    }

    [Fact]
    public async Task UpdateContact_Returns200WithUpdatedData()
    {
        var client = CreateClient();
        var id = await CreateTestContactAsync(client, "Prima", "Versione");

        var response = await client.PutAsJsonAsync($"/api/contacts/{id}", new
        {
            firstName = "Seconda",
            lastName = "Versione",
            email = (string?)null,
            phone = (string?)null,
            company = (string?)null,
            role = (string?)null,
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var contact = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        Assert.Equal("Seconda", contact.GetProperty("firstName").GetString());
    }

    [Fact]
    public async Task UpdateContact_Returns404_WhenNotFound()
    {
        var client = CreateClient();

        var response = await client.PutAsJsonAsync($"/api/contacts/{Guid.NewGuid()}", new
        {
            firstName = "X",
            lastName = "Y",
            email = (string?)null,
            phone = (string?)null,
            company = (string?)null,
            role = (string?)null,
        });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task DeleteContact_Returns204_WhenExists()
    {
        var client = CreateClient();
        var id = await CreateTestContactAsync(client, "Da", "Cancellare");

        var response = await client.DeleteAsync($"/api/contacts/{id}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
    }

    [Fact]
    public async Task DeleteContact_Returns404_WhenNotFound()
    {
        var client = CreateClient();

        var response = await client.DeleteAsync($"/api/contacts/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
