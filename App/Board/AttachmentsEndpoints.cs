using System.Security.Claims;
using App.Storage;
using Microsoft.EntityFrameworkCore;

namespace App.Board;

/// <summary>
/// Endpoints for Attachments on Tasks (ticket #20): upload, list, and proxied download.
/// </summary>
public static class AttachmentsEndpoints
{
    // Category used for all log records emitted by this class.
    private const string LogCategory = "App.Board";

    /// <summary>Registers the Attachments routes on the given <see cref="WebApplication"/>.</summary>
    public static void MapAttachments(this WebApplication app)
    {
        // Nested under the owning Task, mirroring CommentsEndpoints: listing/uploading directly
        // to a Task is always scoped to one Task (CONTEXT.md "un Allegato appartiene sempre a
        // un'Attività"). DisableAntiforgery: this is a multipart upload with no antiforgery
        // token — the platform's cookie-based session auth (core.md) is unaffected.
        var taskAttachmentsGroup = app.MapGroup("/api/tasks/{taskId:guid}/attachments").WithTags("Board");
        taskAttachmentsGroup.MapGet("/", ListAttachments);
        taskAttachmentsGroup.MapPost("/", UploadTaskAttachment).DisableAntiforgery();

        // Not nested under a Task: addresses a single Attachment by its own id, mirroring how
        // DeleteComment/DeleteTask address their resource directly.
        var attachmentsGroup = app.MapGroup("/api/attachments").WithTags("Board");
        attachmentsGroup.MapGet("/{id:guid}/content", DownloadAttachment);
    }

    private static readonly Action<ILogger, Guid, int, Exception?> _attachmentsListed =
        LoggerMessage.Define<Guid, int>(
            LogLevel.Information,
            new EventId(1110, "AttachmentsListed"),
            "Attachments listed — taskId={TaskId}, count={Count}");

    private static readonly Action<ILogger, Guid, Guid, Exception?> _attachmentUploaded =
        LoggerMessage.Define<Guid, Guid>(
            LogLevel.Information,
            new EventId(1111, "AttachmentUploaded"),
            "Attachment uploaded — id={AttachmentId}, taskId={TaskId}");

    /// <summary>Returns every Attachment of a Task, in upload order.</summary>
    private static async System.Threading.Tasks.Task<IResult> ListAttachments(
        Guid taskId,
        AppDbContext db,
        ILoggerFactory loggerFactory)
    {
        var taskExists = await db.Tasks.AnyAsync(t => t.Id == taskId);
        if (!taskExists)
            return Results.NotFound();

        var logger = loggerFactory.CreateLogger(LogCategory);

        var attachments = await db.Attachments
            .Where(a => a.TaskId == taskId)
            .OrderBy(a => a.CreatedAt)
            .ToListAsync();

        _attachmentsListed(logger, taskId, attachments.Count, null);
        return Results.Ok(attachments.Select(AttachmentResponse.From));
    }

    /// <summary>Uploads a file directly to a Task (ticket #20): validates content type and size
    /// server-side, transmits the bytes to the storage capability, then saves the row.</summary>
    private static async System.Threading.Tasks.Task<IResult> UploadTaskAttachment(
        Guid taskId,
        IFormFile? file,
        AppDbContext db,
        IObjectStore objectStore,
        IUserProvisioningService userProvisioning,
        ClaimsPrincipal user,
        ILoggerFactory loggerFactory)
    {
        var task = await db.Tasks.FindAsync(taskId);
        if (task is null)
            return Results.NotFound();

        return await SaveAttachmentAsync(file, taskId, commentId: null, db, objectStore, userProvisioning, user, loggerFactory);
    }

    /// <summary>Shared validation + save path, reused by the Comment upload endpoint (ticket #21).</summary>
    private static async System.Threading.Tasks.Task<IResult> SaveAttachmentAsync(
        IFormFile? file,
        Guid taskId,
        Guid? commentId,
        AppDbContext db,
        IObjectStore objectStore,
        IUserProvisioningService userProvisioning,
        ClaimsPrincipal user,
        ILoggerFactory loggerFactory)
    {
        if (file is null || file.Length == 0)
            return Results.BadRequest(new { error = "File is required." });

        if (file.Length > AttachmentValidation.MaxSizeBytes)
            return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);

        if (string.IsNullOrEmpty(file.ContentType) || !AttachmentValidation.AllowedContentTypes.Contains(file.ContentType))
            return Results.BadRequest(new { error = "Unsupported file type." });

        var logger = loggerFactory.CreateLogger(LogCategory);
        var uploadedBy = await userProvisioning.GetOrCreateCurrentUserAsync(user);

        var attachment = new Attachment
        {
            TaskId = taskId,
            CommentId = commentId,
            FileName = file.FileName,
            ContentType = file.ContentType,
            SizeBytes = file.Length,
            StorageKey = string.Empty, // set below, once Id is known
            UploadedById = uploadedBy.Id,
        };
        attachment.StorageKey = $"attachments/{attachment.Id}";

        await using (var stream = file.OpenReadStream())
        {
            await objectStore.SaveAsync(attachment.StorageKey, stream, attachment.ContentType);
        }

        db.Attachments.Add(attachment);
        await db.SaveChangesAsync();

        _attachmentUploaded(logger, attachment.Id, taskId, null);
        return Results.Created($"/api/attachments/{attachment.Id}/content", AttachmentResponse.From(attachment));
    }

    /// <summary>Downloads an Attachment's bytes, proxied from the storage capability with the
    /// original content type and file name (ticket #20).</summary>
    private static async System.Threading.Tasks.Task<IResult> DownloadAttachment(
        Guid id,
        AppDbContext db,
        IObjectStore objectStore)
    {
        var attachment = await db.Attachments.FindAsync(id);
        if (attachment is null)
            return Results.NotFound();

        using var stored = await objectStore.ReadAsync(attachment.StorageKey);
        if (stored is null)
            return Results.NotFound();

        // Copied into a buffer (attachments are capped at 10 MB) rather than handed to
        // Results.File as a stream, so `stored` can be disposed deterministically here instead of
        // relying on the response pipeline to dispose the underlying S3 stream after it writes.
        using var buffer = new MemoryStream();
        await stored.Content.CopyToAsync(buffer);

        return Results.File(buffer.ToArray(), attachment.ContentType, attachment.FileName);
    }
}
