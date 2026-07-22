using System.Security.Claims;
using App.Realtime;
using App.Storage;
using Microsoft.AspNetCore.SignalR;
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
        // dev/CI, no OIDC contract) leaves them open. Only DeleteTask adds an imperative,
        // resource-based check (creator or AppRoles.BoardModerator) that RequireRole cannot
        // express — see its own comment.
        group.MapGet("/", ListTasks);
        group.MapPost("/", CreateTask);
        group.MapPut("/{id:guid}", UpdateTask);
        group.MapPatch("/{id:guid}/status", UpdateTaskStatus);
        group.MapDelete("/{id:guid}", DeleteTask);
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

    private static readonly Action<ILogger, Guid, Exception?> _taskUpdated =
        LoggerMessage.Define<Guid>(
            LogLevel.Information,
            new EventId(1103, "TaskUpdated"),
            "Task updated — id={TaskId}");

    private static readonly Action<ILogger, Guid, Status, Exception?> _taskStatusChanged =
        LoggerMessage.Define<Guid, Status>(
            LogLevel.Information,
            new EventId(1104, "TaskStatusChanged"),
            "Task status changed — id={TaskId}, status={Status}");

    private static readonly Action<ILogger, Guid, Exception?> _taskDeleted =
        LoggerMessage.Define<Guid>(
            LogLevel.Information,
            new EventId(1105, "TaskDeleted"),
            "Task deleted — id={TaskId}");

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

        // One batch query for every Task's comment count (ticket #18's 💬 badge) instead of one
        // query per Task — same intent as the ADR-0002 sort: keep ListTasks a single round trip.
        var commentCounts = await db.Comments
            .GroupBy(c => c.TaskId)
            .Select(g => new { TaskId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.TaskId, x => x.Count);

        // Grouped by TaskId, not filtered by CommentId — an Attachment's TaskId is always set
        // (ticket #21), so this single group-by already includes both direct Attachments and
        // those uploaded to one of the Task's Comments (ticket #20's 📎 badge).
        var attachmentCounts = await db.Attachments
            .GroupBy(a => a.TaskId)
            .Select(g => new { TaskId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.TaskId, x => x.Count);

        _tasksListed(logger, tasks.Count, null);
        return Results.Ok(tasks.Select(task =>
            TaskResponse.From(
                task,
                canDelete: isModerator || task.CreatedById == currentUser.Id,
                commentCount: commentCounts.GetValueOrDefault(task.Id),
                attachmentCount: attachmentCounts.GetValueOrDefault(task.Id))));
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
        IHubContext<BoardHub, IBoardClient> hub,
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
        // F6 (ticket #23): broadcast after the save commits, never before — every connected
        // client (including this one) re-fetches through GET /api/tasks, which recomputes
        // canDelete/counts per viewer (see BoardHub's own doc).
        await hub.Clients.All.TaskCreated(task.Id);
        // The creator can always delete their own just-created Task — no need to re-resolve
        // the moderator/creator check that ListTasks/UpdateTask perform for arbitrary Tasks.
        // A brand-new Task has no Comments/Attachments yet — no need to query for counts of zero.
        return Results.Created(
            $"/api/tasks/{task.Id}",
            TaskResponse.From(task, canDelete: true, commentCount: 0, attachmentCount: 0));
    }

    /// <summary>
    /// Edits a Task's title/description/urgency/due date (ticket #15) — Status is untouched here,
    /// see <see cref="UpdateTaskStatus"/>. Allowed to any authenticated User, not just the creator.
    /// </summary>
    private static async System.Threading.Tasks.Task<IResult> UpdateTask(
        Guid id,
        UpdateTaskRequest request,
        AppDbContext db,
        IUserProvisioningService userProvisioning,
        IHubContext<BoardHub, IBoardClient> hub,
        ClaimsPrincipal user,
        ILoggerFactory loggerFactory)
    {
        if (string.IsNullOrWhiteSpace(request.Title))
            return Results.BadRequest(new { error = "Title is required." });

        var task = await db.Tasks.FindAsync(id);
        if (task is null)
            return Results.NotFound();

        var logger = loggerFactory.CreateLogger(LogCategory);

        task.Title = request.Title.Trim();
        task.Description = request.Description;
        task.Urgency = request.Urgency;
        task.DueDate = request.DueDate;
        task.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();

        var currentUser = await userProvisioning.GetOrCreateCurrentUserAsync(user);
        var canDelete = user.IsInRole(AppRoles.BoardModerator) || task.CreatedById == currentUser.Id;
        var commentCount = await db.Comments.CountAsync(c => c.TaskId == task.Id);
        var attachmentCount = await db.Attachments.CountAsync(a => a.TaskId == task.Id);

        _taskUpdated(logger, task.Id, null);
        // F6 (ticket #23): see CreateTask's comment on why this carries only the id.
        await hub.Clients.All.TaskUpdated(task.Id);
        return Results.Ok(TaskResponse.From(task, canDelete, commentCount, attachmentCount));
    }

    /// <summary>
    /// Moves a Task between Board columns (ticket #16, drag&amp;drop): changes only Status.
    /// Allowed to any authenticated User, not just the creator.
    /// </summary>
    private static async System.Threading.Tasks.Task<IResult> UpdateTaskStatus(
        Guid id,
        UpdateTaskStatusRequest request,
        AppDbContext db,
        IUserProvisioningService userProvisioning,
        IHubContext<BoardHub, IBoardClient> hub,
        ClaimsPrincipal user,
        ILoggerFactory loggerFactory)
    {
        var task = await db.Tasks.FindAsync(id);
        if (task is null)
            return Results.NotFound();

        var logger = loggerFactory.CreateLogger(LogCategory);

        task.Status = request.Status;
        task.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var currentUser = await userProvisioning.GetOrCreateCurrentUserAsync(user);
        var canDelete = user.IsInRole(AppRoles.BoardModerator) || task.CreatedById == currentUser.Id;
        var commentCount = await db.Comments.CountAsync(c => c.TaskId == task.Id);
        var attachmentCount = await db.Attachments.CountAsync(a => a.TaskId == task.Id);

        _taskStatusChanged(logger, task.Id, task.Status, null);
        // F6 (ticket #23): see CreateTask's comment on why this carries only the id.
        await hub.Clients.All.TaskMoved(task.Id);
        return Results.Ok(TaskResponse.From(task, canDelete, commentCount, attachmentCount));
    }

    /// <summary>
    /// Deletes a Task (ticket #17) — allowed only to its creator or to
    /// <see cref="AppRoles.BoardModerator"/>. This is an imperative, resource-based check on
    /// purpose: <c>RequireRole</c>/policy-based authorization has no way to express "the caller
    /// owns this specific row OR holds a role", so it is invisible to
    /// <c>EndpointRolesAlignmentTests</c> — verified by hand instead (AGENT-CHECKLIST.md §4).
    /// </summary>
    /// <remarks>
    /// Ticket #22 cascade: deleting a Task cascades its Comments and all its Attachments —
    /// direct ones and its Comments' — at the row level via the FK (AppDbContext), but EF never
    /// touches the S3 objects behind those Attachment rows. This handler collects every affected
    /// StorageKey — a single query by TaskId covers both direct and Comment Attachments, since
    /// TaskId is always set (ticket #21) — and deletes each object best-effort *before* removing
    /// the Task, so the objects are gone by the time the rows disappear underneath them.
    /// </remarks>
    private static async System.Threading.Tasks.Task<IResult> DeleteTask(
        Guid id,
        AppDbContext db,
        IObjectStore objectStore,
        IUserProvisioningService userProvisioning,
        IHubContext<BoardHub, IBoardClient> hub,
        ClaimsPrincipal user,
        ILoggerFactory loggerFactory)
    {
        var task = await db.Tasks.FindAsync(id);
        if (task is null)
            return Results.NotFound();

        var currentUser = await userProvisioning.GetOrCreateCurrentUserAsync(user);
        var isCreator = task.CreatedById == currentUser.Id;
        var isModerator = user.IsInRole(AppRoles.BoardModerator);

        if (!isCreator && !isModerator)
            return Results.Forbid();

        var logger = loggerFactory.CreateLogger(LogCategory);

        var storageKeys = await db.Attachments
            .Where(a => a.TaskId == id)
            .Select(a => a.StorageKey)
            .ToListAsync();
        await AttachmentsEndpoints.DeleteStorageObjectsBestEffortAsync(storageKeys, objectStore, logger);

        db.Tasks.Remove(task);
        await db.SaveChangesAsync();

        _taskDeleted(logger, task.Id, null);
        // F6 (ticket #23): see CreateTask's comment on why this carries only the id — the Task
        // (and its Comments/Attachments, cascaded at the row level) is gone by now regardless.
        await hub.Clients.All.TaskDeleted(task.Id);
        return Results.NoContent();
    }
}
