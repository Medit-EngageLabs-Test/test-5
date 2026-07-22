using Microsoft.EntityFrameworkCore;
using BoardAttachment = App.Board.Attachment;
using BoardComment = App.Board.Comment;
using BoardTask = App.Board.Task;
using BoardUser = App.Board.User;

namespace App;

/// <summary>EF Core database context for this application.</summary>
public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    /// <summary>Users table — local mirror of the platform identity (CONTEXT.md "Utente").</summary>
    public DbSet<BoardUser> Users => Set<BoardUser>();

    /// <summary>Tasks table — the Board's units of work (CONTEXT.md "Attività").</summary>
    public DbSet<BoardTask> Tasks => Set<BoardTask>();

    /// <summary>Comments table — a Task's conversation (CONTEXT.md "Commento").</summary>
    public DbSet<BoardComment> Comments => Set<BoardComment>();

    /// <summary>Attachments table — files on Tasks and Comments (CONTEXT.md "Allegato").</summary>
    public DbSet<BoardAttachment> Attachments => Set<BoardAttachment>();

    /// <inheritdoc/>
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<BoardUser>()
            .HasIndex(u => u.Oid)
            .IsUnique();

        modelBuilder.Entity<BoardTask>()
            .HasOne(t => t.CreatedBy)
            .WithMany()
            .HasForeignKey(t => t.CreatedById)
            .IsRequired();

        modelBuilder.Entity<BoardComment>()
            .HasOne(c => c.Task)
            .WithMany()
            .HasForeignKey(c => c.TaskId)
            .IsRequired()
            // Deleting a Task (F3, ticket #17) must not orphan/error on its Comments.
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<BoardComment>()
            .HasOne(c => c.Author)
            .WithMany()
            .HasForeignKey(c => c.AuthorId)
            .IsRequired();

        modelBuilder.Entity<BoardAttachment>()
            .HasOne(a => a.Task)
            .WithMany()
            .HasForeignKey(a => a.TaskId)
            .IsRequired()
            // Deleting a Task (F3, ticket #17) cascades its direct Attachments' rows; the S3
            // objects behind them are not touched by EF — TasksEndpoints.DeleteTask removes those
            // explicitly, best-effort (ticket #22).
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<BoardAttachment>()
            .HasOne(a => a.Comment)
            .WithMany()
            .HasForeignKey(a => a.CommentId)
            .IsRequired(false)
            // Deleting a Comment (F4, ticket #19) cascades its Attachments' rows; same S3 caveat
            // as above — CommentsEndpoints.DeleteComment removes those explicitly (ticket #21).
            // Deleting a Task cascades to its Comments too, so an Attachment on a Comment sees two
            // cascade paths converge on it (Task→Attachment directly, and Task→Comment→Attachment);
            // PostgreSQL allows this.
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<BoardAttachment>()
            .HasOne(a => a.UploadedBy)
            .WithMany()
            .HasForeignKey(a => a.UploadedById)
            // Restrict, not Cascade: a User is never deleted by App code, but this avoids ever
            // wiring a second, unwanted cascade path onto Attachment.
            .IsRequired()
            .OnDelete(DeleteBehavior.Restrict);
    }
}
