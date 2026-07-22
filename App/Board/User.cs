namespace App.Board;

/// <summary>
/// A person who signs in to the App, identified by IntelliFlow (Entra) through <c>oid</c>.
/// This local record mirrors the platform identity (oid, display name, email) — it does not own
/// it — and is the author of Comments and the uploader of Attachments. See CONTEXT.md "Utente".
/// </summary>
public class User
{
    /// <summary>Surrogate identifier — never exposed to the identity provider.</summary>
    public Guid Id { get; init; } = Guid.CreateVersion7();

    /// <summary>
    /// The Entra object id from the <c>oid</c> claim (falls back to <c>sub</c> for providers
    /// without one). Unique — one local User row per platform identity.
    /// </summary>
    public required string Oid { get; set; }

    /// <summary>Display name mirrored from <c>GET /api/auth/me</c>, refreshed on every sign-in.</summary>
    public string? DisplayName { get; set; }

    /// <summary>Email mirrored from <c>GET /api/auth/me</c>, refreshed on every sign-in.</summary>
    public string? Email { get; set; }

    /// <summary>UTC timestamp of first provisioning.</summary>
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;

    /// <summary>UTC timestamp of the last upsert.</summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
