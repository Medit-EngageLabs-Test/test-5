using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using BoardComment = App.Board.Comment;
using BoardTask = App.Board.Task;
using BoardUser = App.Board.User;

namespace App.Tests;

/// <summary>
/// Covers <c>GET/POST /api/tasks/{taskId}/comments</c> (ticket #18): chronological listing and
/// author attribution. <c>PUT/DELETE /api/comments/{id}</c> permissions are ticket #19's own
/// concern — see <see cref="CommentPermissionTests"/> once that lands.
/// </summary>
public class CommentsEndpointTests(RoleAuthenticatedAppFactory factory) : IClassFixture<RoleAuthenticatedAppFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private HttpClient CreateAuthenticatedClient()
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(RoleAuthenticatedAppFactory.RolesHeader, AppRoles.BoardModerator);
        return client;
    }

    private HttpClient CreateAuthenticatedClientWithoutRoles()
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(RoleAuthenticatedAppFactory.RolesHeader, string.Empty);
        return client;
    }

    private async Task<Guid> SeedUserAsync(string? displayName = null, string? email = null)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = new BoardUser { Oid = $"seed-{Guid.NewGuid()}", DisplayName = displayName, Email = email };
        db.Add(user);
        await db.SaveChangesAsync();
        return user.Id;
    }

    private async Task<Guid> SeedTaskAsync(Guid createdById, string title)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var task = new BoardTask { Title = title, CreatedById = createdById };
        db.Add(task);
        await db.SaveChangesAsync();
        return task.Id;
    }

    private async Task<Guid> SeedCommentAsync(Guid taskId, Guid authorId, string body, DateTime createdAt)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var comment = new BoardComment
        {
            TaskId = taskId,
            AuthorId = authorId,
            Body = body,
            CreatedAt = createdAt,
        };
        db.Add(comment);
        await db.SaveChangesAsync();
        return comment.Id;
    }

    // ── GET /api/tasks/{taskId}/comments ────────────────────────────────────────

    [Fact]
    public async Task ListComments_UnknownTaskId_Returns404()
    {
        var client = CreateAuthenticatedClient();

        var response = await client.GetAsync($"/api/tasks/{Guid.NewGuid()}/comments");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task ListComments_ReturnsChronologicalOrder()
    {
        var userId = await SeedUserAsync();
        var taskId = await SeedTaskAsync(userId, $"Attività con conversazione {Guid.NewGuid()}");
        var now = DateTime.UtcNow;

        var third = await SeedCommentAsync(taskId, userId, "Terzo messaggio", now);
        var first = await SeedCommentAsync(taskId, userId, "Primo messaggio", now.AddMinutes(-10));
        var second = await SeedCommentAsync(taskId, userId, "Secondo messaggio", now.AddMinutes(-5));

        var client = CreateAuthenticatedClient();

        var response = await client.GetAsync($"/api/tasks/{taskId}/comments");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var comments = await response.Content.ReadFromJsonAsync<JsonElement[]>(JsonOptions);
        Assert.NotNull(comments);
        var ids = comments!.Select(c => c.GetProperty("id").GetGuid()).ToList();
        Assert.Equal(new[] { first, second, third }, ids);
    }

    [Fact]
    public async Task ListComments_AuthorDisplayName_FallsBackToEmailThenGenericLabel()
    {
        var withName = await SeedUserAsync(displayName: "Maria Rossi");
        var withEmailOnly = await SeedUserAsync(displayName: null, email: "senza-nome@example.com");
        var withNeither = await SeedUserAsync(displayName: null, email: null);
        var taskId = await SeedTaskAsync(withName, $"Autori vari {Guid.NewGuid()}");
        var now = DateTime.UtcNow;

        await SeedCommentAsync(taskId, withName, "Ho un nome", now);
        await SeedCommentAsync(taskId, withEmailOnly, "Ho solo email", now.AddSeconds(1));
        await SeedCommentAsync(taskId, withNeither, "Non ho niente", now.AddSeconds(2));

        var client = CreateAuthenticatedClient();

        var response = await client.GetAsync($"/api/tasks/{taskId}/comments");

        var comments = await response.Content.ReadFromJsonAsync<JsonElement[]>(JsonOptions);
        Assert.NotNull(comments);
        Assert.Equal("Maria Rossi", comments![0].GetProperty("authorDisplayName").GetString());
        Assert.Equal("senza-nome@example.com", comments[1].GetProperty("authorDisplayName").GetString());
        Assert.Equal("Utente", comments[2].GetProperty("authorDisplayName").GetString());
    }

    // ── POST /api/tasks/{taskId}/comments ───────────────────────────────────────

    [Fact]
    public async Task CreateComment_AttributesCurrentUserAsAuthor()
    {
        var userId = await SeedUserAsync();
        var taskId = await SeedTaskAsync(userId, $"Attività per commentare {Guid.NewGuid()}");
        var client = CreateAuthenticatedClientWithoutRoles();
        var body = $"Nuovo messaggio {Guid.NewGuid()}";

        var response = await client.PostAsJsonAsync($"/api/tasks/{taskId}/comments", new { body });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var comment = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        Assert.Equal(body, comment.GetProperty("body").GetString());
        Assert.Equal(taskId, comment.GetProperty("taskId").GetGuid());
        Assert.NotEqual(Guid.Empty, comment.GetProperty("authorId").GetGuid());
        Assert.Null(comment.GetProperty("editedAt").GetString());
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public async Task CreateComment_WithBlankBody_Returns400(string blankBody)
    {
        var userId = await SeedUserAsync();
        var taskId = await SeedTaskAsync(userId, $"Attività {Guid.NewGuid()}");
        var client = CreateAuthenticatedClient();

        var response = await client.PostAsJsonAsync($"/api/tasks/{taskId}/comments", new { body = blankBody });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task CreateComment_UnknownTaskId_Returns404()
    {
        var client = CreateAuthenticatedClient();

        var response = await client.PostAsJsonAsync(
            $"/api/tasks/{Guid.NewGuid()}/comments", new { body = "Un messaggio" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ── GET /api/tasks includes commentCount (ticket #18 — badge 💬) ────────────

    [Fact]
    public async Task ListTasks_CommentCountReflectsWrittenComments()
    {
        var userId = await SeedUserAsync();
        var taskId = await SeedTaskAsync(userId, $"Con commenti {Guid.NewGuid()}");
        var now = DateTime.UtcNow;
        await SeedCommentAsync(taskId, userId, "Uno", now);
        await SeedCommentAsync(taskId, userId, "Due", now.AddSeconds(1));

        var client = CreateAuthenticatedClient();

        var response = await client.GetAsync("/api/tasks");

        var tasks = await response.Content.ReadFromJsonAsync<JsonElement[]>(JsonOptions);
        var task = Assert.Single(tasks!, t => t.GetProperty("id").GetGuid() == taskId);
        Assert.Equal(2, task.GetProperty("commentCount").GetInt32());
    }

    [Fact]
    public async Task ListTasks_CommentCountIsZero_WhenTaskHasNoComments()
    {
        var userId = await SeedUserAsync();
        var taskId = await SeedTaskAsync(userId, $"Senza commenti {Guid.NewGuid()}");
        var client = CreateAuthenticatedClient();

        var response = await client.GetAsync("/api/tasks");

        var tasks = await response.Content.ReadFromJsonAsync<JsonElement[]>(JsonOptions);
        var task = Assert.Single(tasks!, t => t.GetProperty("id").GetGuid() == taskId);
        Assert.Equal(0, task.GetProperty("commentCount").GetInt32());
    }
}
