namespace App.Board;

/// <summary>Body of <c>POST /api/tasks/{taskId}/comments</c> (ticket #18). <see cref="Body"/> is
/// the only field and is required.</summary>
public record CreateCommentRequest(string Body);

/// <summary>Body of <c>PUT /api/comments/{id}</c> (ticket #19): only the author may call this —
/// see <see cref="CommentsEndpoints"/>'s imperative check.</summary>
public record UpdateCommentRequest(string Body);

/// <summary>
/// Wire shape of a Comment, projected instead of serializing the entity directly so the
/// author's display name travels with it without exposing the <see cref="Board.User"/>
/// navigation itself (CONTEXT.md "Commento": author fallback when no display name is set), and
/// so <see cref="CanEdit"/>/<see cref="CanDelete"/> — per-viewer, resource-based facts (ticket
/// #19: author-only edit; author or <see cref="AppRoles.BoardModerator"/> delete) — travel with
/// it without exposing <see cref="AuthorId"/> as something the frontend could derive from.
/// </summary>
public record CommentResponse(
    Guid Id,
    Guid TaskId,
    string Body,
    Guid AuthorId,
    string AuthorDisplayName,
    DateTime CreatedAt,
    DateTime? EditedAt,
    bool CanEdit,
    bool CanDelete)
{
    /// <summary>Projects a <see cref="Comment"/> entity plus the caller-specific <see cref="CanEdit"/>/
    /// <see cref="CanDelete"/> facts — <see cref="Comment.Author"/> must be loaded.</summary>
    public static CommentResponse From(Comment comment, bool canEdit, bool canDelete) => new(
        comment.Id,
        comment.TaskId,
        comment.Body,
        comment.AuthorId,
        ResolveAuthorDisplayName(comment.Author),
        comment.CreatedAt,
        comment.EditedAt,
        canEdit,
        canDelete);

    /// <summary>Display name shown for the author: DisplayName, falling back to Email, falling
    /// back to a generic label when the local User row carries neither (CONTEXT.md "Utente").</summary>
    private static string ResolveAuthorDisplayName(User? author) =>
        author?.DisplayName ?? author?.Email ?? "Utente";
}
