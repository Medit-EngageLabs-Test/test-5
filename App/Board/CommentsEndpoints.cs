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
        var taskCommentsGroup = app.MapGroup("/api/tasks/{taskId:guid}/comments").WithTags("Board");

        // No explicit RequireRole: like the Tasks endpoints, the platform's FallbackPolicy already
        // requires an authenticated session in production (core.md); open mode leaves them open.
        // Only UpdateComment/DeleteComment add an imperative, resource-based check (ticket #19)
        // that RequireRole cannot express — see their own comments.
        taskCommentsGroup.MapGet("/", ListComments);
        taskCommentsGroup.MapPost("/", CreateComment);

        // Not nested under a Task: editing/deleting addresses a single Comment by its own id,
        // mirroring how DeleteTask addresses a Task directly rather than through the Board.
        var commentsGroup = app.MapGroup("/api/comments").WithTags("Board");
        commentsGroup.MapPut("/{id:guid}", UpdateComment);
        commentsGroup.MapDelete("/{id:guid}", DeleteComment);
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

    private static readonly Action<ILogger, Guid, Exception?> _commentUpdated =
        LoggerMessage.Define<Guid>(
            LogLevel.Information,
            new EventId(1108, "CommentUpdated"),
            "Comment updated — id={CommentId}");

    private static readonly Action<ILogger, Guid, Exception?> _commentDeleted =
        LoggerMessage.Define<Guid>(
            LogLevel.Information,
            new EventId(1109, "CommentDeleted"),
            "Comment deleted — id={CommentId}");

    /// <summary>Returns every Comment of a Task in chronological order (CONTEXT.md "Commento":
    /// "lista piatta in ordine cronologico").</summary>
    private static async System.Threading.Tasks.Task<IResult> ListComments(
        Guid taskId,
        AppDbContext db,
        IUserProvisioningService userProvisioning,
        ClaimsPrincipal user,
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

        var currentUser = await userProvisioning.GetOrCreateCurrentUserAsync(user);
        var isModerator = user.IsInRole(AppRoles.BoardModerator);

        _commentsListed(logger, taskId, comments.Count, null);
        return Results.Ok(comments.Select(c => ToResponse(c, currentUser.Id, isModerator)));
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
        // The author can always edit/delete their own just-written Comment — no need to
        // re-resolve the moderator check ListComments/UpdateComment perform for arbitrary Comments.
        return Results.Created(
            $"/api/comments/{comment.Id}",
            CommentResponse.From(comment, canEdit: true, canDelete: true));
    }

    /// <summary>
    /// Edits a Comment's body (ticket #19) — allowed only to its author, unlike Task edits (F3,
    /// ticket #15) which any authenticated User may perform: CONTEXT.md "l'autore può modificare
    /// ed eliminare i propri Commenti" scopes editing to the author alone, with no moderator
    /// override. Imperative, resource-based check on purpose — see <see cref="DeleteComment"/>.
    /// </summary>
    private static async System.Threading.Tasks.Task<IResult> UpdateComment(
        Guid id,
        UpdateCommentRequest request,
        AppDbContext db,
        IUserProvisioningService userProvisioning,
        ClaimsPrincipal user,
        ILoggerFactory loggerFactory)
    {
        if (string.IsNullOrWhiteSpace(request.Body))
            return Results.BadRequest(new { error = "Body is required." });

        var comment = await db.Comments.Include(c => c.Author).FirstOrDefaultAsync(c => c.Id == id);
        if (comment is null)
            return Results.NotFound();

        var currentUser = await userProvisioning.GetOrCreateCurrentUserAsync(user);
        if (comment.AuthorId != currentUser.Id)
            return Results.Forbid();

        var logger = loggerFactory.CreateLogger(LogCategory);

        comment.Body = request.Body.Trim();
        comment.EditedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        _commentUpdated(logger, comment.Id, null);
        // The caller just proved they are the author — moderator status is irrelevant to canEdit
        // (author-only, no override) and canDelete is true either way (author OR moderator).
        return Results.Ok(CommentResponse.From(comment, canEdit: true, canDelete: true));
    }

    /// <summary>
    /// Deletes a Comment (ticket #19) — allowed to its author or to
    /// <see cref="AppRoles.BoardModerator"/>, mirroring F3's <c>DeleteTask</c> (ticket #17).
    /// Imperative, resource-based check on purpose: <c>RequireRole</c>/policy-based authorization
    /// cannot express "the caller owns this specific row OR holds a role", so it is invisible to
    /// <c>EndpointRolesAlignmentTests</c> — verified by hand instead (AGENT-CHECKLIST.md §4).
    /// </summary>
    private static async System.Threading.Tasks.Task<IResult> DeleteComment(
        Guid id,
        AppDbContext db,
        IUserProvisioningService userProvisioning,
        ClaimsPrincipal user,
        ILoggerFactory loggerFactory)
    {
        var comment = await db.Comments.FindAsync(id);
        if (comment is null)
            return Results.NotFound();

        var currentUser = await userProvisioning.GetOrCreateCurrentUserAsync(user);
        var isAuthor = comment.AuthorId == currentUser.Id;
        var isModerator = user.IsInRole(AppRoles.BoardModerator);

        if (!isAuthor && !isModerator)
            return Results.Forbid();

        db.Comments.Remove(comment);
        await db.SaveChangesAsync();

        var logger = loggerFactory.CreateLogger(LogCategory);
        _commentDeleted(logger, comment.Id, null);
        return Results.NoContent();
    }

    /// <summary>Projects a <see cref="Comment"/> plus the caller-specific <see cref="CommentResponse.CanEdit"/>/
    /// <see cref="CommentResponse.CanDelete"/> facts (ticket #19: author-only edit; author or Moderator delete).</summary>
    private static CommentResponse ToResponse(Comment comment, Guid currentUserId, bool isModerator)
    {
        var isAuthor = comment.AuthorId == currentUserId;
        return CommentResponse.From(comment, canEdit: isAuthor, canDelete: isAuthor || isModerator);
    }
}
