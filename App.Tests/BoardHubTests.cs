using System.Net.Http.Json;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;

namespace App.Tests;

/// <summary>
/// Covers the real-time Board hub (F6, ticket #23 — ADR-0001): every Task write endpoint
/// broadcasts the matching <see cref="App.Realtime.IBoardClient"/> event once its
/// <c>SaveChangesAsync</c> commits. Connects a real <see cref="HubConnection"/> through the
/// <see cref="AppFactory"/>'s in-memory <c>TestServer</c> — the delivery proof that matters is the
/// two-client Playwright E2E (<c>e2e/board-realtime.spec.ts</c>); this is the fast, backend-only
/// confirmation that each handler actually calls the hub, not a substitute for it.
/// </summary>
/// <remarks>
/// <see cref="HttpTransportType.LongPolling"/> is forced because <c>TestServer</c> has no real
/// socket to upgrade to WebSocket — test-only, and orthogonal to ADR-0001 (which governs
/// production's automatic transport negotiation, never forced in the App itself).
/// </remarks>
public class BoardHubTests(AppFactory factory) : IClassFixture<AppFactory>, IAsyncLifetime
{
    private const string HubPath = "/api/hubs/board";
    private static readonly TimeSpan EventTimeout = TimeSpan.FromSeconds(10);

    private HubConnection _connection = null!;

    async System.Threading.Tasks.Task IAsyncLifetime.InitializeAsync()
    {
        _connection = new HubConnectionBuilder()
            .WithUrl(new Uri(factory.Server.BaseAddress, HubPath), options =>
            {
                options.HttpMessageHandlerFactory = _ => factory.Server.CreateHandler();
                options.Transports = HttpTransportType.LongPolling;
            })
            .Build();

        await _connection.StartAsync();
    }

    async System.Threading.Tasks.Task IAsyncLifetime.DisposeAsync() => await _connection.DisposeAsync();

    /// <summary>Awaits the next invocation of a single-<see cref="Guid"/>-argument hub event.</summary>
    private System.Threading.Tasks.Task<Guid> AwaitEvent(string eventName)
    {
        var tcs = new TaskCompletionSource<Guid>(TaskCreationOptions.RunContinuationsAsynchronously);
        // On<T> registers a new handler each call — fine here since each test awaits exactly one
        // invocation per registration and the connection itself is torn down after each test.
        _connection.On<Guid>(eventName, id => tcs.TrySetResult(id));
        return tcs.Task.WaitAsync(EventTimeout);
    }

    [Fact]
    public async Task CreateTask_BroadcastsTaskCreated_WithTheNewTasksId()
    {
        var client = factory.CreateClient();
        var eventTask = AwaitEvent("TaskCreated");

        var response = await client.PostAsJsonAsync("/api/tasks", new { title = $"Hub {Guid.NewGuid()}" });
        var created = await response.Content.ReadFromJsonAsync<JsonTaskResponse>();

        var broadcastTaskId = await eventTask;
        Assert.Equal(created!.Id, broadcastTaskId);
    }

    [Fact]
    public async Task UpdateTask_BroadcastsTaskUpdated_WithTheEditedTasksId()
    {
        var client = factory.CreateClient();
        var createResponse = await client.PostAsJsonAsync("/api/tasks", new { title = $"Hub {Guid.NewGuid()}" });
        var created = await createResponse.Content.ReadFromJsonAsync<JsonTaskResponse>();

        var eventTask = AwaitEvent("TaskUpdated");
        await client.PutAsJsonAsync($"/api/tasks/{created!.Id}", new { title = "Edited", urgency = "Medium" });

        var broadcastTaskId = await eventTask;
        Assert.Equal(created.Id, broadcastTaskId);
    }

    [Fact]
    public async Task UpdateTaskStatus_BroadcastsTaskMoved_WithTheMovedTasksId()
    {
        var client = factory.CreateClient();
        var createResponse = await client.PostAsJsonAsync("/api/tasks", new { title = $"Hub {Guid.NewGuid()}" });
        var created = await createResponse.Content.ReadFromJsonAsync<JsonTaskResponse>();

        var eventTask = AwaitEvent("TaskMoved");
        await client.PatchAsJsonAsync($"/api/tasks/{created!.Id}/status", new { status = "Doing" });

        var broadcastTaskId = await eventTask;
        Assert.Equal(created.Id, broadcastTaskId);
    }

    [Fact]
    public async Task DeleteTask_BroadcastsTaskDeleted_WithTheDeletedTasksId()
    {
        var client = factory.CreateClient();
        var createResponse = await client.PostAsJsonAsync("/api/tasks", new { title = $"Hub {Guid.NewGuid()}" });
        var created = await createResponse.Content.ReadFromJsonAsync<JsonTaskResponse>();

        var eventTask = AwaitEvent("TaskDeleted");
        await client.DeleteAsync($"/api/tasks/{created!.Id}");

        var broadcastTaskId = await eventTask;
        Assert.Equal(created.Id, broadcastTaskId);
    }

    // Minimal wire-shape record — only the field these tests read off each JSON response.
    private sealed record JsonTaskResponse(Guid Id);
}
