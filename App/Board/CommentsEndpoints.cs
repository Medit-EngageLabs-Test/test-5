using System.Security.Claims;
using Microsoft.EntityFrameworkCore;

namespace App.Board;

/// <summary>Endpoints for a Task's Comments conversation (ticket #18): read and write messages.</summary>
public static class CommentsEndpoints
{
    // Category used for all log records emitted by this class.
    private const string LogCategory = "App.Board";

    /// <summary>Registers the Comments routes on the given <see cref="WebApplication"/>.</summary>
    public static void MapComments(this WebApplication app)
    {
        // Nested under the owning Task: listing/writing a conversation is always scoped to one
        // Task, matching CONTEXT.md's "un Commento appartiene sempre a un'Attività".
        var group = app.MapGroup("/api/tasks/{taskId:guid}/comments").WithTags("Board");

        // No explicit RequireRole: like the Tasks endpoints, the platform's FallbackPolicy already
        // requires an authenticated session in production (core.md); open mode leaves them open.
        group.MapGet("/", ListComments);
        group.MapPost("/", CreateComment);
    }

    private static readonly Action<ILogger, Guid, int, Exception?> _commentsListed =
        LoggerMessage.Define<Guid, int>(
            LogLevel.Information,
            new EventId(1106, "CommentsListed"),
            "Comments listed — taskId={TaskId}, count={Count}");

    private static readonly Action<ILogger, Guid, Guid, Exception?> _commentCreated =
        LoggerMessage.Define<Guid, Guid>(
            LogLevel.Information,
            new EventId(1107, "CommentCreated"),
            "Comment created — id={CommentId}, taskId={TaskId}");

    /// <summary>Returns every Comment of a Task in chronological order (CONTEXT.md "Commento":
    /// "lista piatta in ordine cronologico").</summary>
    private static async System.Threading.Tasks.Task<IResult> ListComments(
        Guid taskId,
        AppDbContext db,
        ILoggerFactory loggerFactory)
    {
        var taskExists = await db.Tasks.AnyAsync(t => t.Id == taskId);
        if (!taskExists)
            return Results.NotFound();

        var logger = loggerFactory.CreateLogger(LogCategory);

        var comments = await db.Comments
            .Where(c => c.TaskId == taskId)
            .Include(c => c.Author)
            .OrderBy(c => c.CreatedAt)
            .ToListAsync();

        _commentsListed(logger, taskId, comments.Count, null);
        return Results.Ok(comments.Select(CommentResponse.From));
    }

    /// <summary>
    /// Writes a Comment (ticket #18): the author is always the current User (the open-mode
    /// synthetic User when there is no session — CONTEXT.md "Utente"), via the same race-safe
    /// provisioning F3's Task endpoints use.
    /// </summary>
    private static async System.Threading.Tasks.Task<IResult> CreateComment(
        Guid taskId,
        CreateCommentRequest request,
        AppDbContext db,
        IUserProvisioningService userProvisioning,
        ClaimsPrincipal user,
        ILoggerFactory loggerFactory)
    {
        if (string.IsNullOrWhiteSpace(request.Body))
            return Results.BadRequest(new { error = "Body is required." });

        var taskExists = await db.Tasks.AnyAsync(t => t.Id == taskId);
        if (!taskExists)
            return Results.NotFound();

        var logger = loggerFactory.CreateLogger(LogCategory);
        var author = await userProvisioning.GetOrCreateCurrentUserAsync(user);

        var comment = new Comment
        {
            TaskId = taskId,
            Body = request.Body.Trim(),
            AuthorId = author.Id,
        };

        db.Comments.Add(comment);
        await db.SaveChangesAsync();

        _commentCreated(logger, comment.Id, taskId, null);
        // Author is already in hand — no need to re-query/Include it like ListComments does.
        comment.Author = author;
        return Results.Created($"/api/comments/{comment.Id}", CommentResponse.From(comment));
    }
}
