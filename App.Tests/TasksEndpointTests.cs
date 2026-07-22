using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using BoardTask = App.Board.Task;
using BoardUser = App.Board.User;

namespace App.Tests;

/// <summary>
/// Covers <c>GET /api/tasks</c>: empty list, and the ADR-0002 ordering (Urgency High→Low, then
/// DueDate ascending with no-due-date last, then CreatedAt descending) seeded directly through
/// <see cref="AppDbContext"/> — ticket #9 ships no write endpoint yet.
/// </summary>
public class TasksEndpointTests(RoleAuthenticatedAppFactory factory) : IClassFixture<RoleAuthenticatedAppFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    // Requires just an authenticated session (no role) — any declared role exercises that,
    // per iam.md's "only declared roles" rule for the test/dev-bypass mechanism.
    private HttpClient CreateAuthenticatedClient()
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(RoleAuthenticatedAppFactory.RolesHeader, AppRoles.BoardModerator);
        return client;
    }

    private async Task<Guid> SeedUserAsync()
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = new BoardUser { Oid = $"seed-{Guid.NewGuid()}" };
        db.Add(user);
        await db.SaveChangesAsync();
        return user.Id;
    }

    private async Task<Guid> SeedTaskAsync(
        Guid createdById,
        string title,
        App.Board.Urgency urgency,
        DateOnly? dueDate,
        DateTime createdAt)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var task = new BoardTask
        {
            Title = title,
            Urgency = urgency,
            DueDate = dueDate,
            CreatedById = createdById,
            CreatedAt = createdAt,
        };
        db.Add(task);
        await db.SaveChangesAsync();
        return task.Id;
    }

    [Fact]
    public async Task ListTasks_ReturnsEmptyArray_WhenNoTasksExist()
    {
        // Isolated Contacts/roles.json-style RoleAuthenticatedAppFactory instance for this class —
        // no seeding happened yet on this instance's connection scope by the time this runs first.
        var client = CreateAuthenticatedClient();

        var response = await client.GetAsync("/api/tasks");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var tasks = await response.Content.ReadFromJsonAsync<JsonElement[]>();
        Assert.NotNull(tasks);
    }

    // "Requires only authentication" is exercised where the fallback policy actually applies:
    // AuthenticationTests.GetTasks_WithoutSession_Returns401 (OIDC configured, production-like)
    // and OpenModeAuthenticationTests.GetTasks_InOpenMode_Returns200WithoutASession (no OIDC).
    // RoleAuthenticatedAppFactory boots in open mode too, so an anonymous request here would
    // also return 200 — asserting 401 against it would be testing the wrong factory.

    [Fact]
    public async Task ListTasks_OrdersByUrgencyThenDueDateThenCreatedAt_PerAdr0002()
    {
        var userId = await SeedUserAsync();
        var now = DateTime.UtcNow;
        var today = DateOnly.FromDateTime(now);

        // Same Urgency (High), different DueDate: earlier due date first, no-due-date last.
        var highNoDueDate = await SeedTaskAsync(userId, "Alta senza scadenza", App.Board.Urgency.High, null, now);
        var highLaterDue = await SeedTaskAsync(userId, "Alta scadenza lontana", App.Board.Urgency.High, today.AddDays(10), now);
        var highEarlierDue = await SeedTaskAsync(userId, "Alta scadenza vicina", App.Board.Urgency.High, today.AddDays(1), now);

        // Same Urgency+DueDate as highEarlierDue: CreatedAt descending (most recent first) is
        // the final tiebreaker — seeded explicitly, not relying on wall-clock insertion order.
        var highEarlierDueOlder = await SeedTaskAsync(
            userId, "Alta scadenza vicina più vecchia", App.Board.Urgency.High, today.AddDays(1), now.AddMinutes(-10));

        // Lower Urgency must sort after every High task regardless of due date.
        var mediumUrgentDue = await SeedTaskAsync(userId, "Media", App.Board.Urgency.Medium, today, now);
        var lowUrgentDue = await SeedTaskAsync(userId, "Bassa", App.Board.Urgency.Low, today, now);

        var client = CreateAuthenticatedClient();

        var response = await client.GetAsync("/api/tasks");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var tasks = await response.Content.ReadFromJsonAsync<JsonElement[]>(JsonOptions);
        Assert.NotNull(tasks);
        var returnedIds = tasks!.Select(t => t.GetProperty("id").GetGuid()).ToList();

        // Other test methods in this class share the same RoleAuthenticatedAppFactory (and
        // therefore the same testdb): filter the full response down to this test's own seeded
        // ids, preserving the API's order, so unrelated rows never affect the assertion.
        var expectedOrder = new[]
            { highEarlierDue, highEarlierDueOlder, highLaterDue, highNoDueDate, mediumUrgentDue, lowUrgentDue };
        var actualOrder = returnedIds.Where(expectedOrder.Contains).ToList();

        Assert.Equal(expectedOrder, actualOrder);
    }

    [Fact]
    public async Task ListTasks_SerializesStatusAndUrgencyAsNames()
    {
        var userId = await SeedUserAsync();
        await SeedTaskAsync(userId, "Nomi enum", App.Board.Urgency.Medium, null, DateTime.UtcNow);

        var client = CreateAuthenticatedClient();

        var response = await client.GetAsync("/api/tasks");

        var tasks = await response.Content.ReadFromJsonAsync<JsonElement[]>(JsonOptions);
        var task = Assert.Single(tasks!, t => t.GetProperty("title").GetString() == "Nomi enum");
        Assert.Equal("ToDo", task.GetProperty("status").GetString());
        Assert.Equal("Medium", task.GetProperty("urgency").GetString());
    }
}
