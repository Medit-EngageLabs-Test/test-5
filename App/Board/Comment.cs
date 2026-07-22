namespace App.Board;

/// <summary>
/// A message a User writes in a Task's conversation (CONTEXT.md "Commento"). Comments of a Task
/// form a flat, chronological list; the author may edit or delete their own (ticket #19).
/// </summary>
public class Comment
{
    /// <summary>Unique identifier.</summary>
    public Guid Id { get; init; } = Guid.CreateVersion7();

    /// <summary>Foreign key to the <see cref="Task"/> this Comment belongs to.</summary>
    public Guid TaskId { get; set; }

    /// <summary>The Task this Comment belongs to.</summary>
    public Task? Task { get; set; }

    /// <summary>The message text, always required.</summary>
    public required string Body { get; set; }

    /// <summary>Foreign key to the <see cref="User"/> who wrote this Comment.</summary>
    public Guid AuthorId { get; set; }

    /// <summary>The User who wrote this Comment.</summary>
    public User? Author { get; set; }

    /// <summary>UTC timestamp of creation.</summary>
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;

    /// <summary>UTC timestamp of the last edit by its author, or null if never edited (ticket #19).</summary>
    public DateTime? EditedAt { get; set; }
}
