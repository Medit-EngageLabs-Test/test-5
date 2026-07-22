using System.Security.Claims;
using App.Realtime;
using App.Storage;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace App.Board;

/// <summary>
/// Endpoints for Attachments on Tasks (ticket #20) and Comments (ticket #21): upload, list,
/// proxied download, and removal (ticket #22).
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

        // Ticket #21: uploads to a specific Comment. TaskId is always derived from the Comment
        // server-side (see UploadCommentAttachment) — never accepted from the client — so an
        // Attachment's TaskId/CommentId can never disagree.
        var commentAttachmentsGroup = app.MapGroup("/api/comments/{commentId:guid}/attachments").WithTags("Board");
        commentAttachmentsGroup.MapPost("/", UploadCommentAttachment).DisableAntiforgery();

        // Not nested under a Task: addresses a single Attachment by its own id, mirroring how
        // DeleteComment/DeleteTask address their resource directly.
        var attachmentsGroup = app.MapGroup("/api/attachments").WithTags("Board");
        attachmentsGroup.MapGet("/{id:guid}/content", DownloadAttachment);
        attachmentsGroup.MapDelete("/{id:guid}", DeleteAttachment);
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

    private static readonly Action<ILogger, string, Exception?> _attachmentS3DeleteFailed =
        LoggerMessage.Define<string>(
            LogLevel.Warning,
            new EventId(1113, "AttachmentS3DeleteFailed"),
            "Attachment S3 object could not be deleted (best-effort) — key={StorageKey}");

    private static readonly Action<ILogger, Guid, Exception?> _attachmentDeleted =
        LoggerMessage.Define<Guid>(
            LogLevel.Information,
            new EventId(1112, "AttachmentDeleted"),
            "Attachment deleted — id={AttachmentId}");

    /// <summary>Returns every Attachment of a Task, in upload order.</summary>
    private static async System.Threading.Tasks.Task<IResult> ListAttachments(
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

        var attachments = await db.Attachments
            .Where(a => a.TaskId == taskId)
            .OrderBy(a => a.CreatedAt)
            .ToListAsync();

        var currentUser = await userProvisioning.GetOrCreateCurrentUserAsync(user);
        var isModerator = user.IsInRole(AppRoles.BoardModerator);

        _attachmentsListed(logger, taskId, attachments.Count, null);
        return Results.Ok(attachments.Select(a => ToResponse(a, currentUser.Id, isModerator)));
    }

    /// <summary>Uploads a file directly to a Task (ticket #20): validates content type and size
    /// server-side, transmits the bytes to the storage capability, then saves the row.</summary>
    private static async System.Threading.Tasks.Task<IResult> UploadTaskAttachment(
        Guid taskId,
        IFormFile? file,
        AppDbContext db,
        IObjectStore objectStore,
        IUserProvisioningService userProvisioning,
        IHubContext<BoardHub, IBoardClient> hub,
        ClaimsPrincipal user,
        ILoggerFactory loggerFactory)
    {
        var task = await db.Tasks.FindAsync(taskId);
        if (task is null)
            return Results.NotFound();

        return await SaveAttachmentAsync(file, taskId, commentId: null, db, objectStore, userProvisioning, hub, user, loggerFactory);
    }

    /// <summary>Uploads a file to a Comment (ticket #21): same validations as
    /// <see cref="UploadTaskAttachment"/>, with <see cref="Attachment.TaskId"/> always derived
    /// from the Comment's own Task, never from the client.</summary>
    private static async System.Threading.Tasks.Task<IResult> UploadCommentAttachment(
        Guid commentId,
        IFormFile? file,
        AppDbContext db,
        IObjectStore objectStore,
        IUserProvisioningService userProvisioning,
        IHubContext<BoardHub, IBoardClient> hub,
        ClaimsPrincipal user,
        ILoggerFactory loggerFactory)
    {
        var comment = await db.Comments.FindAsync(commentId);
        if (comment is null)
            return Results.NotFound();

        return await SaveAttachmentAsync(file, comment.TaskId, commentId, db, objectStore, userProvisioning, hub, user, loggerFactory);
    }

    /// <summary>Shared validation + save path, reused by the Comment upload endpoint (ticket #21).</summary>
    private static async System.Threading.Tasks.Task<IResult> SaveAttachmentAsync(
        IFormFile? file,
        Guid taskId,
        Guid? commentId,
        AppDbContext db,
        IObjectStore objectStore,
        IUserProvisioningService userProvisioning,
        IHubContext<BoardHub, IBoardClient> hub,
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
        // F6 (ticket #24): see BoardHub's own doc on why this carries only the ids (also updates
        // the Board card's 📎 badge on every connected client).
        await hub.Clients.All.AttachmentAdded(taskId, attachment.Id);
        // The uploader can always delete their own just-uploaded Attachment — no need to
        // re-resolve the moderator check ListAttachments performs for arbitrary Attachments.
        return Results.Created(
            $"/api/attachments/{attachment.Id}/content",
            AttachmentResponse.From(attachment, canDelete: true));
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

    /// <summary>
    /// Deletes an Attachment (ticket #22) — allowed to its uploader or to
    /// <see cref="AppRoles.BoardModerator"/>, mirroring F3/F4's delete endpoints. Imperative,
    /// resource-based check on purpose: <c>RequireRole</c>/policy-based authorization cannot
    /// express "the caller owns this specific row OR holds a role", so it is invisible to
    /// <c>EndpointRolesAlignmentTests</c> — verified by hand instead (AGENT-CHECKLIST.md §4).
    /// Removes the S3 object best-effort before the row, so a failed object delete never blocks
    /// the row from going away.
    /// </summary>
    private static async System.Threading.Tasks.Task<IResult> DeleteAttachment(
        Guid id,
        AppDbContext db,
        IObjectStore objectStore,
        IUserProvisioningService userProvisioning,
        IHubContext<BoardHub, IBoardClient> hub,
        ClaimsPrincipal user,
        ILoggerFactory loggerFactory)
    {
        var attachment = await db.Attachments.FindAsync(id);
        if (attachment is null)
            return Results.NotFound();

        var currentUser = await userProvisioning.GetOrCreateCurrentUserAsync(user);
        var isUploader = attachment.UploadedById == currentUser.Id;
        var isModerator = user.IsInRole(AppRoles.BoardModerator);

        if (!isUploader && !isModerator)
            return Results.Forbid();

        var logger = loggerFactory.CreateLogger(LogCategory);
        await DeleteStorageObjectsBestEffortAsync([attachment.StorageKey], objectStore, logger);

        // Captured before Remove/SaveChanges, mirroring DeleteComment's own broadcast capture.
        var taskId = attachment.TaskId;

        db.Attachments.Remove(attachment);
        await db.SaveChangesAsync();

        _attachmentDeleted(logger, attachment.Id, null);
        // F6 (ticket #24): see BoardHub's own doc on why this carries only the ids.
        await hub.Clients.All.AttachmentRemoved(taskId, attachment.Id);
        return Results.NoContent();
    }

    /// <summary>Projects an <see cref="Attachment"/> plus the caller-specific
    /// <see cref="AttachmentResponse.CanDelete"/> fact (ticket #22: uploader or Moderator).</summary>
    private static AttachmentResponse ToResponse(Attachment attachment, Guid currentUserId, bool isModerator)
    {
        var isUploader = attachment.UploadedById == currentUserId;
        return AttachmentResponse.From(attachment, canDelete: isUploader || isModerator);
    }

    /// <summary>
    /// Deletes each of <paramref name="storageKeys"/> from the storage capability, best-effort:
    /// a failure on one key is logged and skipped rather than raised, so it never blocks the
    /// caller's own row deletion. Shared by <see cref="CommentsEndpoints.DeleteComment"/>'s
    /// cascade (ticket #21), <see cref="TasksEndpoints.DeleteTask"/>'s (ticket #22), and this
    /// class's own <see cref="DeleteAttachment"/>.
    /// </summary>
    internal static async System.Threading.Tasks.Task DeleteStorageObjectsBestEffortAsync(
        IEnumerable<string> storageKeys,
        IObjectStore objectStore,
        ILogger logger)
    {
        foreach (var key in storageKeys)
        {
            try
            {
                await objectStore.DeleteAsync(key);
            }
            catch (Exception ex)
            {
                _attachmentS3DeleteFailed(logger, key, ex);
            }
        }
    }
}
