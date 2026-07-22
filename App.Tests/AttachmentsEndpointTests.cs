using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using App.Storage;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using BoardComment = App.Board.Comment;
using BoardTask = App.Board.Task;
using BoardUser = App.Board.User;

namespace App.Tests;

/// <summary>
/// Covers <c>GET/POST /api/tasks/{taskId}/attachments</c> and <c>GET /api/attachments/{id}/content</c>
/// (ticket #20): server-side validation (size/content-type whitelist), the S3 round trip via
/// <see cref="IObjectStore"/>, and the proxied download. Also covers
/// <c>POST /api/comments/{commentId}/attachments</c> and the Attachment cascade on Comment
/// deletion (ticket #21).
/// </summary>
public class AttachmentsEndpointTests(RoleAuthenticatedAppFactory factory) : IClassFixture<RoleAuthenticatedAppFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private HttpClient CreateAuthenticatedClient()
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(RoleAuthenticatedAppFactory.RolesHeader, AppRoles.BoardModerator);
        return client;
    }

    private async Task<Guid> SeedUserAsync()
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = new BoardUser { Oid = $"seed-{Guid.NewGuid()}" };
        db.Add(user);
        await db.SaveChangesAsync();
        return user.Id;
    }

    private async Task<Guid> SeedTaskAsync(Guid createdById, string title)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var task = new BoardTask { Title = title, CreatedById = createdById };
        db.Add(task);
        await db.SaveChangesAsync();
        return task.Id;
    }

    private async Task<Guid> SeedCommentAsync(Guid taskId, Guid authorId, string body)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var comment = new BoardComment { TaskId = taskId, AuthorId = authorId, Body = body };
        db.Add(comment);
        await db.SaveChangesAsync();
        return comment.Id;
    }

    /// <summary>The StorageKey EF persisted for a just-uploaded Attachment — used to clean up the
    /// real MinIO object this test created, and to verify no fallback/hardcoded key leaked in.</summary>
    private async Task<string> GetStorageKeyAsync(Guid attachmentId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var attachment = await db.Attachments.FindAsync(attachmentId);
        Assert.NotNull(attachment);
        return attachment!.StorageKey;
    }

    private static MultipartFormDataContent BuildUpload(byte[] bytes, string fileName, string contentType)
    {
        var multipart = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(bytes);
        fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
        multipart.Add(fileContent, "file", fileName);
        return multipart;
    }

    // ── GET /api/tasks/{taskId}/attachments ─────────────────────────────────────

    [Fact]
    public async Task ListAttachments_UnknownTaskId_Returns404()
    {
        var client = CreateAuthenticatedClient();

        var response = await client.GetAsync($"/api/tasks/{Guid.NewGuid()}/attachments");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task ListAttachments_ReturnsEmptyArray_WhenTaskHasNone()
    {
        var taskId = await SeedTaskAsync(await SeedUserAsync(), $"Attività senza allegati {Guid.NewGuid()}");
        var client = CreateAuthenticatedClient();

        var response = await client.GetAsync($"/api/tasks/{taskId}/attachments");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var attachments = await response.Content.ReadFromJsonAsync<JsonElement[]>(JsonOptions);
        Assert.NotNull(attachments);
        Assert.Empty(attachments!);
    }

    // ── POST /api/tasks/{taskId}/attachments ─────────────────────────────────────

    [Fact]
    public async Task UploadTaskAttachment_ValidFile_SavesRowAndS3Object()
    {
        var taskId = await SeedTaskAsync(await SeedUserAsync(), $"Attività per allegati {Guid.NewGuid()}");
        var client = CreateAuthenticatedClient();
        var marker = $"e2e-attachment-{Guid.NewGuid()}";
        var content = Encoding.UTF8.GetBytes(marker);
        using var multipart = BuildUpload(content, "nota.txt", "text/plain");

        var response = await client.PostAsync($"/api/tasks/{taskId}/attachments", multipart);

        var attachmentId = Guid.Empty;
        try
        {
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            var attachment = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
            attachmentId = attachment.GetProperty("id").GetGuid();
            Assert.Equal(taskId, attachment.GetProperty("taskId").GetGuid());
            Assert.Null(attachment.GetProperty("commentId").GetString());
            Assert.Equal("nota.txt", attachment.GetProperty("fileName").GetString());
            Assert.Equal("text/plain", attachment.GetProperty("contentType").GetString());
            Assert.Equal(content.Length, attachment.GetProperty("sizeBytes").GetInt64());
            Assert.NotEqual(Guid.Empty, attachment.GetProperty("uploadedById").GetGuid());

            // Round-trips through the real storage capability, not just the DB row.
            using var scope = factory.Services.CreateScope();
            var objectStore = scope.ServiceProvider.GetRequiredService<IObjectStore>();
            var storageKey = await GetStorageKeyAsync(attachmentId);
            using var stored = await objectStore.ReadAsync(storageKey);
            Assert.NotNull(stored);
            Assert.Equal("text/plain", stored!.ContentType);
            using var buffer = new MemoryStream();
            await stored.Content.CopyToAsync(buffer);
            Assert.Equal(content, buffer.ToArray());
        }
        finally
        {
            // Never leaves an object behind, whether the assertions above passed or failed.
            using var scope = factory.Services.CreateScope();
            var objectStore = scope.ServiceProvider.GetRequiredService<IObjectStore>();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var stored = await db.Attachments.FindAsync(attachmentId);
            if (stored is not null)
            {
                await objectStore.DeleteAsync(stored.StorageKey);
                db.Attachments.Remove(stored);
                await db.SaveChangesAsync();
            }
        }
    }

    [Fact]
    public async Task UploadTaskAttachment_UnknownTaskId_Returns404()
    {
        var client = CreateAuthenticatedClient();
        using var multipart = BuildUpload(Encoding.UTF8.GetBytes("contenuto"), "file.txt", "text/plain");

        var response = await client.PostAsync($"/api/tasks/{Guid.NewGuid()}/attachments", multipart);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task UploadTaskAttachment_NoFile_Returns400()
    {
        var taskId = await SeedTaskAsync(await SeedUserAsync(), $"Attività {Guid.NewGuid()}");
        var client = CreateAuthenticatedClient();
        using var multipart = new MultipartFormDataContent();

        var response = await client.PostAsync($"/api/tasks/{taskId}/attachments", multipart);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UploadTaskAttachment_OverMaxSize_Returns413()
    {
        var taskId = await SeedTaskAsync(await SeedUserAsync(), $"Attività {Guid.NewGuid()}");
        var client = CreateAuthenticatedClient();
        // One byte over the 10 MB server-side limit — content is irrelevant to this check.
        var oversized = new byte[App.Board.AttachmentValidation.MaxSizeBytes + 1];
        using var multipart = BuildUpload(oversized, "troppo-grande.bin", "text/plain");

        var response = await client.PostAsync($"/api/tasks/{taskId}/attachments", multipart);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);

        // Nothing should have been persisted — no row means no leaked S3 object either.
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.False(await db.Attachments.AnyAsync(a => a.TaskId == taskId));
    }

    [Fact]
    public async Task UploadTaskAttachment_ContentTypeOutsideWhitelist_Returns400()
    {
        var taskId = await SeedTaskAsync(await SeedUserAsync(), $"Attività {Guid.NewGuid()}");
        var client = CreateAuthenticatedClient();
        using var multipart = BuildUpload(
            Encoding.UTF8.GetBytes("MZ..."), "eseguibile.exe", "application/x-msdownload");

        var response = await client.PostAsync($"/api/tasks/{taskId}/attachments", multipart);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.False(await db.Attachments.AnyAsync(a => a.TaskId == taskId));
    }

    // ── GET /api/attachments/{id}/content ────────────────────────────────────────

    [Fact]
    public async Task DownloadAttachment_ReturnsSameBytesUploaded()
    {
        var taskId = await SeedTaskAsync(await SeedUserAsync(), $"Attività download {Guid.NewGuid()}");
        var client = CreateAuthenticatedClient();
        var content = Encoding.UTF8.GetBytes($"contenuto da scaricare {Guid.NewGuid()}");
        using var multipart = BuildUpload(content, "download.txt", "text/plain");
        var uploadResponse = await client.PostAsync($"/api/tasks/{taskId}/attachments", multipart);
        var uploaded = await uploadResponse.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
        var attachmentId = uploaded.GetProperty("id").GetGuid();

        try
        {
            var response = await client.GetAsync($"/api/attachments/{attachmentId}/content");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal("text/plain", response.Content.Headers.ContentType?.MediaType);
            Assert.Equal("download.txt", response.Content.Headers.ContentDisposition?.FileNameStar
                ?? response.Content.Headers.ContentDisposition?.FileName?.Trim('"'));
            var downloaded = await response.Content.ReadAsByteArrayAsync();
            Assert.Equal(content, downloaded);
        }
        finally
        {
            using var scope = factory.Services.CreateScope();
            var objectStore = scope.ServiceProvider.GetRequiredService<IObjectStore>();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var stored = await db.Attachments.FindAsync(attachmentId);
            if (stored is not null)
            {
                await objectStore.DeleteAsync(stored.StorageKey);
                db.Attachments.Remove(stored);
                await db.SaveChangesAsync();
            }
        }
    }

    [Fact]
    public async Task DownloadAttachment_UnknownId_Returns404()
    {
        var client = CreateAuthenticatedClient();

        var response = await client.GetAsync($"/api/attachments/{Guid.NewGuid()}/content");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // ── #21 — POST /api/comments/{commentId}/attachments ───────────────────────

    [Fact]
    public async Task UploadCommentAttachment_ValidFile_SavesRowWithTaskIdDerivedFromComment()
    {
        var userId = await SeedUserAsync();
        var taskId = await SeedTaskAsync(userId, $"Attività con conversazione {Guid.NewGuid()}");
        var commentId = await SeedCommentAsync(taskId, userId, "Un messaggio");
        var client = CreateAuthenticatedClient();
        var content = Encoding.UTF8.GetBytes($"allegato di un messaggio {Guid.NewGuid()}");
        using var multipart = BuildUpload(content, "allegato-messaggio.txt", "text/plain");

        var response = await client.PostAsync($"/api/comments/{commentId}/attachments", multipart);

        var attachmentId = Guid.Empty;
        try
        {
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            var attachment = await response.Content.ReadFromJsonAsync<JsonElement>(JsonOptions);
            attachmentId = attachment.GetProperty("id").GetGuid();
            // TaskId is derived from the Comment server-side — never accepted from the client.
            Assert.Equal(taskId, attachment.GetProperty("taskId").GetGuid());
            Assert.Equal(commentId, attachment.GetProperty("commentId").GetGuid());
        }
        finally
        {
            using var scope = factory.Services.CreateScope();
            var objectStore = scope.ServiceProvider.GetRequiredService<IObjectStore>();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var stored = await db.Attachments.FindAsync(attachmentId);
            if (stored is not null)
            {
                await objectStore.DeleteAsync(stored.StorageKey);
                db.Attachments.Remove(stored);
                await db.SaveChangesAsync();
            }
        }
    }

    [Fact]
    public async Task UploadCommentAttachment_UnknownCommentId_Returns404()
    {
        var client = CreateAuthenticatedClient();
        using var multipart = BuildUpload(Encoding.UTF8.GetBytes("contenuto"), "file.txt", "text/plain");

        var response = await client.PostAsync($"/api/comments/{Guid.NewGuid()}/attachments", multipart);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task ListAttachments_IncludesAttachmentsUploadedToComments()
    {
        var userId = await SeedUserAsync();
        var taskId = await SeedTaskAsync(userId, $"Attività {Guid.NewGuid()}");
        var commentId = await SeedCommentAsync(taskId, userId, "Un messaggio");
        var client = CreateAuthenticatedClient();
        using var multipart = BuildUpload(Encoding.UTF8.GetBytes("contenuto"), "sul-messaggio.txt", "text/plain");
        var uploadResponse = await client.PostAsync($"/api/comments/{commentId}/attachments", multipart);
        var attachmentId = (await uploadResponse.Content.ReadFromJsonAsync<JsonElement>(JsonOptions))
            .GetProperty("id").GetGuid();

        try
        {
            var response = await client.GetAsync($"/api/tasks/{taskId}/attachments");

            var attachments = await response.Content.ReadFromJsonAsync<JsonElement[]>(JsonOptions);
            var attachment = Assert.Single(attachments!, a => a.GetProperty("id").GetGuid() == attachmentId);
            Assert.Equal(commentId, attachment.GetProperty("commentId").GetGuid());
        }
        finally
        {
            using var scope = factory.Services.CreateScope();
            var objectStore = scope.ServiceProvider.GetRequiredService<IObjectStore>();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var stored = await db.Attachments.FindAsync(attachmentId);
            if (stored is not null)
            {
                await objectStore.DeleteAsync(stored.StorageKey);
                db.Attachments.Remove(stored);
                await db.SaveChangesAsync();
            }
        }
    }

    // ── #21 — Cascata: eliminare un Commento elimina i suoi Allegati ────────────

    [Fact]
    public async Task DeleteComment_CascadesItsAttachments_RowsAndS3Object()
    {
        var userId = await SeedUserAsync();
        var taskId = await SeedTaskAsync(userId, $"Attività {Guid.NewGuid()}");
        var commentId = await SeedCommentAsync(taskId, userId, "Un messaggio con allegato");
        var client = CreateAuthenticatedClient();
        using var multipart = BuildUpload(Encoding.UTF8.GetBytes("contenuto"), "da-cancellare.txt", "text/plain");
        var uploadResponse = await client.PostAsync($"/api/comments/{commentId}/attachments", multipart);
        var attachmentId = (await uploadResponse.Content.ReadFromJsonAsync<JsonElement>(JsonOptions))
            .GetProperty("id").GetGuid();

        string storageKey;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            storageKey = (await db.Attachments.FindAsync(attachmentId))!.StorageKey;
        }

        var deleteResponse = await client.DeleteAsync($"/api/comments/{commentId}");

        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);

        using var verifyScope = factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var objectStore = verifyScope.ServiceProvider.GetRequiredService<IObjectStore>();
        Assert.Null(await verifyDb.Attachments.FindAsync(attachmentId));
        Assert.Null(await objectStore.ReadAsync(storageKey));
    }
}
