namespace App.Board;

/// <summary>Body of <c>POST /api/tasks/{taskId}/comments</c> (ticket #18). <see cref="Body"/> is
/// the only field and is required.</summary>
public record CreateCommentRequest(string Body);

/// <summary>
/// Wire shape of a Comment, projected instead of serializing the entity directly so the
/// author's display name travels with it without exposing the <see cref="Board.User"/>
/// navigation itself (CONTEXT.md "Commento": author fallback when no display name is set).
/// </summary>
public record CommentResponse(
    Guid Id,
    Guid TaskId,
    string Body,
    Guid AuthorId,
    string AuthorDisplayName,
    DateTime CreatedAt,
    DateTime? EditedAt)
{
    /// <summary>Projects a <see cref="Comment"/> entity — <see cref="Comment.Author"/> must be loaded.</summary>
    public static CommentResponse From(Comment comment) => new(
        comment.Id,
        comment.TaskId,
        comment.Body,
        comment.AuthorId,
        ResolveAuthorDisplayName(comment.Author),
        comment.CreatedAt,
        comment.EditedAt);

    /// <summary>Display name shown for the author: DisplayName, falling back to Email, falling
    /// back to a generic label when the local User row carries neither (CONTEXT.md "Utente").</summary>
    private static string ResolveAuthorDisplayName(User? author) =>
        author?.DisplayName ?? author?.Email ?? "Utente";
}
