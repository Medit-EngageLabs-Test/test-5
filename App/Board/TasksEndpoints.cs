using Microsoft.EntityFrameworkCore;

namespace App.Board;

/// <summary>Read endpoints for the Board's Tasks resource.</summary>
public static class TasksEndpoints
{
    // Category used for all log records emitted by this class.
    private const string LogCategory = "App.Board";

    /// <summary>Registers all /api/tasks routes on the given <see cref="WebApplication"/>.</summary>
    public static void MapTasks(this WebApplication app)
    {
        var group = app.MapGroup("/api/tasks").WithTags("Board");

        // No explicit RequireRole: like ListContacts, the platform's FallbackPolicy already
        // requires an authenticated session in production (core.md); open mode (local dev/CI,
        // no OIDC contract) leaves it open, matching the board's read-only local rendering.
        group.MapGet("/", ListTasks);
    }

    private static readonly Action<ILogger, int, Exception?> _tasksListed =
        LoggerMessage.Define<int>(
            LogLevel.Information,
            new EventId(1101, "TasksListed"),
            "Tasks listed — count={Count}");

    /// <summary>
    /// Returns every Task ordered per ADR-0002: Urgency (High→Low), then DueDate ascending
    /// (Tasks without a due date last), then CreatedAt descending (most recent first).
    /// </summary>
    // Fully-qualified return type: bare "Task" in this namespace resolves to the Task entity
    // declared alongside this class, not System.Threading.Tasks.Task (CS0104/CS0308).
    private static async System.Threading.Tasks.Task<IResult> ListTasks(AppDbContext db, ILoggerFactory loggerFactory)
    {
        var logger = loggerFactory.CreateLogger(LogCategory);

        var tasks = await db.Tasks
            .OrderByDescending(t => t.Urgency)
            .ThenBy(t => t.DueDate == null)
            .ThenBy(t => t.DueDate)
            .ThenByDescending(t => t.CreatedAt)
            .ToListAsync();

        _tasksListed(logger, tasks.Count, null);
        return Results.Ok(tasks);
    }
}
