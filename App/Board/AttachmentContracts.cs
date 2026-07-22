namespace App.Board;

/// <summary>
/// Wire shape of an Attachment, projected instead of serializing the entity directly (ticket #20).
/// </summary>
public record AttachmentResponse(
    Guid Id,
    Guid TaskId,
    Guid? CommentId,
    string FileName,
    string ContentType,
    long SizeBytes,
    Guid UploadedById,
    DateTime CreatedAt)
{
    /// <summary>Projects an <see cref="Attachment"/> entity onto its wire shape.</summary>
    public static AttachmentResponse From(Attachment attachment) => new(
        attachment.Id,
        attachment.TaskId,
        attachment.CommentId,
        attachment.FileName,
        attachment.ContentType,
        attachment.SizeBytes,
        attachment.UploadedById,
        attachment.CreatedAt);
}
