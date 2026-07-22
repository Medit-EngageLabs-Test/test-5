using System.Security.Claims;
using Microsoft.EntityFrameworkCore;

namespace App.Board;

/// <summary>Endpoints for the Board's Tasks resource: list, create, edit, move, delete.</summary>
public static class TasksEndpoints
{
    // Category used for all log records emitted by this class.
    private const string LogCategory = "App.Board";

    /// <summary>Registers all /api/tasks routes on the given <see cref="WebApplication"/>.</summary>
    public static void MapTasks(this WebApplication app)
    {
        var group = app.MapGroup("/api/tasks").WithTags("Board");

        // No explicit RequireRole on any of these: like ListTasks, the platform's FallbackPolicy
        // already requires an authenticated session in production (core.md); open mode (local
        // dev/CI, no OIDC contract) leaves them open. A later ticket (#17, delete) adds an
        // imperative, resource-based check that RequireRole cannot express — see its own comment.
        group.MapGet("/", ListTasks);
        group.MapPost("/", CreateTask);
    }

    private static readonly Action<ILogger, int, Exception?> _tasksListed =
        LoggerMessage.Define<int>(
            LogLevel.Information,
            new EventId(1101, "TasksListed"),
            "Tasks listed — count={Count}");

    private static readonly Action<ILogger, Guid, Exception?> _taskCreated =
        LoggerMessage.Define<Guid>(
            LogLevel.Information,
            new EventId(1102, "TaskCreated"),
            "Task created — id={TaskId}");

    /// <summary>
    /// Returns every Task ordered per ADR-0002: Urgency (High→Low), then DueDate ascending
    /// (Tasks without a due date last), then CreatedAt descending (most recent first).
    /// </summary>
    // Fully-qualified return type: bare "Task" in this namespace resolves to the Task entity
    // declared alongside this class, not System.Threading.Tasks.Task (CS0104/CS0308).
    private static async System.Threading.Tasks.Task<IResult> ListTasks(
        AppDbContext db,
        IUserProvisioningService userProvisioning,
        ClaimsPrincipal user,
        ILoggerFactory loggerFactory)
    {
        var logger = loggerFactory.CreateLogger(LogCategory);

        var tasks = await db.Tasks
            .OrderByDescending(t => t.Urgency)
            .ThenBy(t => t.DueDate == null)
            .ThenBy(t => t.DueDate)
            .ThenByDescending(t => t.CreatedAt)
            .ToListAsync();

        var currentUser = await userProvisioning.GetOrCreateCurrentUserAsync(user);
        var isModerator = user.IsInRole(AppRoles.BoardModerator);

        _tasksListed(logger, tasks.Count, null);
        return Results.Ok(tasks.Select(task =>
            TaskResponse.From(task, canDelete: isModerator || task.CreatedById == currentUser.Id)));
    }

    /// <summary>
    /// Creates a Task (ticket #14): <see cref="Task.CreatedById"/> is always the current User
    /// (the open-mode synthetic User when there is no session — CONTEXT.md "Utente"), Status
    /// starts at <see cref="Status.ToDo"/>, Urgency defaults to <see cref="Urgency.Medium"/>
    /// when the request omits it. Title is the only required field.
    /// </summary>
    private static async System.Threading.Tasks.Task<IResult> CreateTask(
        CreateTaskRequest request,
        AppDbContext db,
        IUserProvisioningService userProvisioning,
        ClaimsPrincipal user,
        ILoggerFactory loggerFactory)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
            return Results.BadRequest(new { error = "Title is required." });

        var logger = loggerFactory.CreateLogger(LogCategory);
        var createdBy = await userProvisioning.GetOrCreateCurrentUserAsync(user);

        var task = new Task
        {
            Title = request.Title.Trim(),
            Description = request.Description,
            Urgency = request.Urgency ?? Urgency.Medium,
            DueDate = request.DueDate,
            CreatedById = createdBy.Id,
        };

        db.Tasks.Add(task);
        await db.SaveChangesAsync();

        _taskCreated(logger, task.Id, null);
        // The creator can always delete their own just-created Task — no need to re-resolve
        // the moderator/creator check that ListTasks/UpdateTask perform for arbitrary Tasks.
        return Results.Created($"/api/tasks/{task.Id}", TaskResponse.From(task, canDelete: true));
    }
}
