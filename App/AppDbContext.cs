using Microsoft.EntityFrameworkCore;
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
    }
}
