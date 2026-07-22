namespace App.Board;

/// <summary>
/// The unit of work on the Board: created by a <see cref="User"/>, moved between
/// <see cref="Status"/> columns, carries an <see cref="Urgency"/> and an optional due date.
/// </summary>
public class Task
{
    /// <summary>Unique identifier.</summary>
    public Guid Id { get; init; } = Guid.CreateVersion7();

    /// <summary>Short title, always required.</summary>
    public required string Title { get; set; }

    /// <summary>Optional free-text description.</summary>
    public string? Description { get; set; }

    /// <summary>Column the Task currently sits in.</summary>
    public Status Status { get; set; } = Status.ToDo;

    /// <summary>Priority level — visual badge and primary sort key (ADR-0002).</summary>
    public Urgency Urgency { get; set; } = Urgency.Medium;

    /// <summary>Optional date by which the Task should be completed.</summary>
    public DateOnly? DueDate { get; set; }

    /// <summary>Foreign key to the <see cref="User"/> who created this Task.</summary>
    public Guid CreatedById { get; set; }

    /// <summary>The User who created this Task.</summary>
    public User? CreatedBy { get; set; }

    /// <summary>UTC timestamp of creation — the last ADR-0002 sort tiebreaker (recent first).</summary>
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;

    /// <summary>UTC timestamp of last update.</summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>The Board column a Task sits in — Stato in the domain glossary (CONTEXT.md).</summary>
public enum Status
{
    ToDo,
    Doing,
    Done,
}

/// <summary>
/// Task priority — Urgenza in the domain glossary (CONTEXT.md). Numeric order matters:
/// declared Low→High so <c>OrderByDescending</c> yields High→Low per ADR-0002.
/// </summary>
public enum Urgency
{
    Low,
    Medium,
    High,
}
