namespace App.Board;

/// <summary>
/// A file uploaded by a User and kept in the storage capability's shared bucket (CONTEXT.md
/// "Allegato"). Always belongs to a Task; optionally to one Comment of that same Task (ticket
/// #21) — <see cref="AttachmentsEndpoints"/> derives <see cref="TaskId"/> from the Comment
/// itself when an Attachment is uploaded to one, so the two can never disagree.
/// </summary>
public class Attachment
{
    /// <summary>Unique identifier.</summary>
    public Guid Id { get; init; } = Guid.CreateVersion7();

    /// <summary>Foreign key to the <see cref="Task"/> this Attachment belongs to — always set,
    /// even when <see cref="CommentId"/> is also set (ticket #21).</summary>
    public Guid TaskId { get; set; }

    /// <summary>The Task this Attachment belongs to.</summary>
    public Task? Task { get; set; }

    /// <summary>Foreign key to the <see cref="Comment"/> this Attachment was uploaded to, or
    /// <c>null</c> when it was uploaded directly to the Task (ticket #20).</summary>
    public Guid? CommentId { get; set; }

    /// <summary>The Comment this Attachment belongs to, when <see cref="CommentId"/> is set.</summary>
    public Comment? Comment { get; set; }

    /// <summary>Original file name, as supplied by the uploader.</summary>
    public required string FileName { get; set; }

    /// <summary>MIME type, validated server-side against <see cref="AttachmentValidation.AllowedContentTypes"/>.</summary>
    public required string ContentType { get; set; }

    /// <summary>File size in bytes, validated server-side against <see cref="AttachmentValidation.MaxSizeBytes"/>.</summary>
    public long SizeBytes { get; set; }

    /// <summary>
    /// Bare object key inside the storage capability's shared bucket — the App's folder prefix is
    /// added by <see cref="Storage.IObjectStore"/> itself, never stored here (storage.md folder
    /// discipline guardrail).
    /// </summary>
    public required string StorageKey { get; set; }

    /// <summary>Foreign key to the <see cref="User"/> who uploaded this Attachment.</summary>
    public Guid UploadedById { get; set; }

    /// <summary>The User who uploaded this Attachment.</summary>
    public User? UploadedBy { get; set; }

    /// <summary>UTC timestamp of upload.</summary>
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}
