namespace App.Board;

// Fully-qualified in the return-type positions below where bare "Task" would be ambiguous
// (CS0104/CS0308) is not needed here — these are plain data contracts, never Task<T>.

/// <summary>Body of <c>POST /api/tasks</c> (ticket #14). <see cref="Title"/> is the only
/// required field; <see cref="Urgency"/> defaults to <see cref="Board.Urgency.Medium"/> when
/// omitted (CONTEXT.md "Urgenza").</summary>
public record CreateTaskRequest(string Title, string? Description, Urgency? Urgency, DateOnly? DueDate);

/// <summary>Body of <c>PUT /api/tasks/{id}</c> (ticket #15): a full field replacement except
/// <see cref="Status"/>, which only <c>PATCH /api/tasks/{id}/status</c> changes.</summary>
public record UpdateTaskRequest(string Title, string? Description, Urgency Urgency, DateOnly? DueDate);

/// <summary>Body of <c>PATCH /api/tasks/{id}/status</c> (ticket #16): the Status a drag&amp;drop
/// move between Board columns resolves to.</summary>
public record UpdateTaskStatusRequest(Status Status);

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
