using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace App.Tests;

public class AppFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    // xUnit gives every test class its own AppFactory (or subclass) instance via IClassFixture,
    // and classes without a shared [Collection] run in parallel — all of them pointed at the
    // same physical testdb. Without this guard, concurrent InitializeAsync calls race to apply
    // the same pending migration and one loses with "relation already exists" (42P07). The
    // semaphore is static so it serializes every subclass too (AuthenticatedAppFactory,
    // RoleAuthenticatedAppFactory, LoopbackIssuerAppFactory), not just this base class.
    private static readonly SemaphoreSlim MigrationGate = new(1, 1);

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var connectionString = Environment.GetEnvironmentVariable("TEST_DB_CONNECTION_STRING")
            ?? "Host=localhost;Database=testdb;Username=testuser;Password=testpassword";
        builder.UseSetting("ConnectionStrings:Database", connectionString);
    }

    async Task IAsyncLifetime.InitializeAsync()
    {
        await MigrationGate.WaitAsync();
        try
        {
            using var scope = Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.Database.MigrateAsync();
        }
        finally
        {
            MigrationGate.Release();
        }
    }

    Task IAsyncLifetime.DisposeAsync() => Task.CompletedTask;
}

public class HealthEndpointTests(AppFactory factory) : IClassFixture<AppFactory>
{
    [Fact]
    public async Task GetHealth_Returns200WithHealthyStatus()
    {
        var client = factory.CreateClient();

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        var doc = JsonDocument.Parse(body);
        Assert.Equal("healthy", doc.RootElement.GetProperty("status").GetString());
    }
}
