namespace App.Board;

/// <summary>
/// Wire shape of an Attachment, projected instead of serializing the entity directly so
/// <see cref="CanDelete"/> — a per-viewer, resource-based fact (ticket #22: uploader or
/// <see cref="AppRoles.BoardModerator"/>) — travels with it without exposing the
/// <see cref="Board.User"/> navigation itself. <see cref="CommentId"/> is non-null when it was
/// uploaded to a Comment rather than directly to the Task (ticket #21) — the frontend partitions
/// one Task-wide list by this field instead of calling a separate per-Comment endpoint.
/// </summary>
public record AttachmentResponse(
    Guid Id,
    Guid TaskId,
    Guid? CommentId,
    string FileName,
    string ContentType,
    long SizeBytes,
    Guid UploadedById,
    DateTime CreatedAt,
    bool CanDelete)
{
    /// <summary>Projects an <see cref="Attachment"/> entity plus the caller-specific <see cref="CanDelete"/> fact.</summary>
    public static AttachmentResponse From(Attachment attachment, bool canDelete) => new(
        attachment.Id,
        attachment.TaskId,
        attachment.CommentId,
        attachment.FileName,
        attachment.ContentType,
        attachment.SizeBytes,
        attachment.UploadedById,
        attachment.CreatedAt,
        canDelete);
}
