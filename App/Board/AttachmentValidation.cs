namespace App.Board;

/// <summary>
/// Server-side validation rules for Attachment uploads (tickets #20/#21), enforced regardless of
/// what the client claims: a fixed maximum size and a content-type whitelist.
/// </summary>
public static class AttachmentValidation
{
    /// <summary>Maximum upload size — 10 MB, enforced server-side (tickets #20/#21).</summary>
    public const long MaxSizeBytes = 10 * 1024 * 1024;

    /// <summary>Content types accepted for upload; any other value is rejected with 400.</summary>
    public static readonly IReadOnlySet<string> AllowedContentTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "application/pdf",
        "text/plain",
        "text/csv",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/zip",
    };
}
