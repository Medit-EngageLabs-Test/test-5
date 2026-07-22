using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
// Type aliases, not `using App.Board;`: that namespace also declares the Task entity, which
// would collide with System.Threading.Tasks.Task in every `async Task` test method signature.
using IUserProvisioningService = App.Board.IUserProvisioningService;
using UserProvisioningService = App.Board.UserProvisioningService;

namespace App.Tests;

/// <summary>
/// Covers <see cref="IUserProvisioningService"/>: lazy upsert by <c>oid</c> refreshing
/// DisplayName/Email, and the open-mode synthetic "Sviluppo locale" User (ticket #9). Exercised
/// directly against a scoped <see cref="AppDbContext"/> — no HTTP endpoint calls this service yet.
/// </summary>
public class UserProvisioningServiceTests(AppFactory factory) : IClassFixture<AppFactory>
{
    private static ClaimsPrincipal PrincipalWith(string oid, string? displayName = null, string? email = null)
    {
        var claims = new List<Claim> { new("oid", oid) };
        if (displayName is not null) claims.Add(new Claim("name", displayName));
        if (email is not null) claims.Add(new Claim("email", email));
        return new ClaimsPrincipal(new ClaimsIdentity(claims));
    }

    [Fact]
    public async Task GetOrCreateCurrentUserAsync_CreatesUser_WhenOidIsNew()
    {
        using var scope = factory.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<IUserProvisioningService>();
        var oid = $"oid-{Guid.NewGuid()}";

        var user = await service.GetOrCreateCurrentUserAsync(PrincipalWith(oid, "Prima Volta", "prima@test.com"));

        Assert.Equal(oid, user.Oid);
        Assert.Equal("Prima Volta", user.DisplayName);
        Assert.Equal("prima@test.com", user.Email);
    }

    [Fact]
    public async Task GetOrCreateCurrentUserAsync_UpdatesDisplayNameAndEmail_OnRepeatedSignIn()
    {
        using var scope = factory.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<IUserProvisioningService>();
        var oid = $"oid-{Guid.NewGuid()}";
        var first = await service.GetOrCreateCurrentUserAsync(PrincipalWith(oid, "Nome Vecchio", "vecchio@test.com"));

        var second = await service.GetOrCreateCurrentUserAsync(PrincipalWith(oid, "Nome Nuovo", "nuovo@test.com"));

        Assert.Equal(first.Id, second.Id);
        Assert.Equal("Nome Nuovo", second.DisplayName);
        Assert.Equal("nuovo@test.com", second.Email);

        using var verifyScope = factory.Services.CreateScope();
        var db = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(1, await db.Users.CountAsync(u => u.Oid == oid));
    }

    [Fact]
    public async Task GetOrCreateCurrentUserAsync_ReturnsSyntheticUser_WhenPrincipalHasNoOid()
    {
        using var scope = factory.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<IUserProvisioningService>();
        var anonymous = new ClaimsPrincipal(new ClaimsIdentity());

        var user = await service.GetOrCreateCurrentUserAsync(anonymous);

        Assert.Equal(UserProvisioningService.LocalDevOid, user.Oid);
        Assert.Equal(UserProvisioningService.LocalDevDisplayName, user.DisplayName);
    }

    [Fact]
    public async Task GetOrCreateCurrentUserAsync_ReusesSyntheticUser_AcrossCalls()
    {
        using var scope = factory.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<IUserProvisioningService>();
        var anonymous = new ClaimsPrincipal(new ClaimsIdentity());

        var first = await service.GetOrCreateCurrentUserAsync(anonymous);
        var second = await service.GetOrCreateCurrentUserAsync(anonymous);

        Assert.Equal(first.Id, second.Id);

        using var verifyScope = factory.Services.CreateScope();
        var db = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(1, await db.Users.CountAsync(u => u.Oid == UserProvisioningService.LocalDevOid));
    }

    [Fact]
    public async Task GetOrCreateCurrentUserAsync_IsRaceSafe_WhenManyConcurrentCallersShareAFreshOid()
    {
        // A fresh oid, never seen before: every concurrent caller races through the same
        // SingleOrDefault -> null -> Add -> SaveChanges path, reproducing the IX_Users_Oid
        // unique-constraint race a fresh CI database hit on first sign-in (the CI failure this
        // test is a local proxy for). Random per run and never LocalDevOid, so this stays
        // idempotent on the shared, persistent test5db and never collides with the synthetic
        // User other test classes in this run rely on.
        var oid = $"race-{Guid.NewGuid()}";
        const int concurrency = 50;

        // Every caller gets its own DI scope (own AppDbContext instance, own connection) — the
        // same shape as N simultaneous HTTP requests, never a single DbContext shared across
        // threads (which is unsupported and would just be a different bug).
        var startGate = new TaskCompletionSource();
        var callTasks = Enumerable.Range(0, concurrency).Select(async _ =>
        {
            await startGate.Task; // line every caller up so they all race SaveChanges together
            using var scope = factory.Services.CreateScope();
            var service = scope.ServiceProvider.GetRequiredService<IUserProvisioningService>();
            return await service.GetOrCreateCurrentUserAsync(PrincipalWith(oid, "Utente Concorrente", "race@test.com"));
        }).ToList();

        startGate.SetResult();
        var users = await System.Threading.Tasks.Task.WhenAll(callTasks);

        Assert.All(users, u => Assert.Equal(oid, u.Oid));
        // Every concurrent caller must agree on the same winning row — the loser(s) of the
        // SaveChanges race must return it too, not their own failed insert or a stale instance.
        Assert.Single(users.Select(u => u.Id).Distinct());

        using var verifyScope = factory.Services.CreateScope();
        var db = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(1, await db.Users.CountAsync(u => u.Oid == oid));
    }
}
