namespace App.Board;

/// <summary>Body of <c>POST /api/tasks</c> (ticket #14). <see cref="Title"/> is the only
/// required field; <see cref="Urgency"/> defaults to <see cref="Board.Urgency.Medium"/> when
/// omitted (CONTEXT.md "Urgenza").</summary>
public record CreateTaskRequest(string Title, string? Description, Urgency? Urgency, DateOnly? DueDate);

/// <summary>
/// Wire shape of a Task, projected instead of serializing the entity directly so
/// <see cref="CanDelete"/> — a per-viewer, resource-based fact (ticket #17: creator or
/// <see cref="AppRoles.BoardModerator"/>) — travels with it without ever exposing the
/// <see cref="Board.User"/> navigation itself (name/email of the creator).
/// </summary>
public record TaskResponse(
    Guid Id,
    string Title,
    string? Description,
    Status Status,
    Urgency Urgency,
    DateOnly? DueDate,
    Guid CreatedById,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    bool CanDelete)
{
    /// <summary>Projects a <see cref="Task"/> entity plus the caller-specific <see cref="CanDelete"/> fact.</summary>
    public static TaskResponse From(Task task, bool canDelete) => new(
        task.Id,
        task.Title,
        task.Description,
        task.Status,
        task.Urgency,
        task.DueDate,
        task.CreatedById,
        task.CreatedAt,
        task.UpdatedAt,
        canDelete);
}
