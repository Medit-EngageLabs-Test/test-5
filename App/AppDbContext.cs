using App.Contacts;
using Microsoft.EntityFrameworkCore;
using BoardTask = App.Board.Task;
using BoardUser = App.Board.User;

namespace App;

/// <summary>EF Core database context for this application.</summary>
public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    /// <summary>Contacts table.</summary>
    public DbSet<Contact> Contacts => Set<Contact>();

    /// <summary>Users table — local mirror of the platform identity (CONTEXT.md "Utente").</summary>
    public DbSet<BoardUser> Users => Set<BoardUser>();

    /// <summary>Tasks table — the Board's units of work (CONTEXT.md "Attività").</summary>
    public DbSet<BoardTask> Tasks => Set<BoardTask>();

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
    }
}
