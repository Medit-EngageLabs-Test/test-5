using Microsoft.AspNetCore.SignalR;

namespace App.Realtime;

/// <summary>
/// Strongly-typed client contract for <see cref="BoardHub"/> (ADR-0001): every method here is a
/// broadcast the server pushes to connected clients — the Board never invokes anything back on
/// the hub, so <see cref="BoardHub"/> declares no server-side methods of its own.
/// </summary>
/// <remarks>
/// Each event carries only the affected row's id(s), never a projected DTO (<c>TaskResponse</c>,
/// <c>CommentResponse</c>, <c>AttachmentResponse</c>): those carry per-viewer, resource-based
/// facts (<c>CanDelete</c>/<c>CanEdit</c>) computed for whoever called the originating endpoint.
/// Broadcasting that projection verbatim to every other connected client would show them an
/// affordance (e.g. a delete button) computed for someone else's permissions. Clients react to an
/// event by re-fetching through the same authenticated <c>GET</c> the rest of the UI already
/// uses, which recomputes those facts — and the comment/attachment counts — for the viewer that
/// receives them.
/// </remarks>
public interface IBoardClient
{
    /// <summary>A Task was created (ticket #14).</summary>
    Task TaskCreated(Guid taskId);

    /// <summary>A Task's title/description/urgency/due date was edited (ticket #15).</summary>
    Task TaskUpdated(Guid taskId);

    /// <summary>A Task moved to another Board column (ticket #16).</summary>
    Task TaskMoved(Guid taskId);

    /// <summary>A Task was deleted (ticket #17).</summary>
    Task TaskDeleted(Guid taskId);

    /// <summary>A Comment was added to a Task's conversation (ticket #18).</summary>
    Task CommentAdded(Guid taskId, Guid commentId);

    /// <summary>A Comment's body was edited (ticket #19).</summary>
    Task CommentUpdated(Guid taskId, Guid commentId);

    /// <summary>A Comment was deleted (ticket #19).</summary>
    Task CommentDeleted(Guid taskId, Guid commentId);

    /// <summary>An Attachment was uploaded to a Task or one of its Comments (tickets #20/#21).</summary>
    Task AttachmentAdded(Guid taskId, Guid attachmentId);

    /// <summary>An Attachment was removed (ticket #22).</summary>
    Task AttachmentRemoved(Guid taskId, Guid attachmentId);
}

/// <summary>
/// Real-time hub for the Board (F6, ticket #23 — ADR-0001): a single shared Board (CONTEXT.md)
/// broadcasts every Task/Comment/Attachment change to all connected clients via
/// <see cref="IHubContext{THub,T}"/>, so there is never a need for per-connection groups — every
/// connected client sees the same Board. Mapped in <c>Program.cs</c> under the <c>/api</c> prefix
/// (after the platform authentication wiring, without modifying it) so it inherits exactly the
/// same open-mode/authenticated gating every other <c>/api</c> endpoint gets for free: reachable
/// without a session in open mode (no OIDC portal contract — local dev/CI), and gated behind the
/// BFF session cookie once the platform's authenticated <c>FallbackPolicy</c> is in effect.
/// Relies entirely on SignalR's automatic transport negotiation (WebSocket → Server-Sent Events →
/// long polling) — the portal contract does not document ingress WebSocket support, and a single
/// App instance with no backplane needs no transport that requires sticky routing.
/// </summary>
public sealed class BoardHub : Hub<IBoardClient>;
