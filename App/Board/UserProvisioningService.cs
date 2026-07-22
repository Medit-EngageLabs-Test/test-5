using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace App.Board;

// Async signatures below fully-qualify System.Threading.Tasks.Task<T>: bare "Task" in this
// namespace resolves to the Task entity declared alongside User (CS0104/CS0308).

/// <summary>
/// Resolves the signed-in <see cref="User"/> for the current request, lazily upserting the local
/// row from the platform identity (the same claims <c>GET /api/auth/me</c> exposes). In open mode
/// (no OIDC portal contract — local development/CI, core.md "IAM") there is no identity at all:
/// callers get a synthetic "Sviluppo locale" User instead, created once and reused.
/// </summary>
public interface IUserProvisioningService
{
    /// <summary>
    /// Returns the local <see cref="User"/> for <paramref name="principal"/>, creating or
    /// refreshing it as needed. Falls back to the synthetic open-mode User when the principal
    /// carries no <c>oid</c>/<c>sub</c> claim.
    /// </summary>
    System.Threading.Tasks.Task<User> GetOrCreateCurrentUserAsync(ClaimsPrincipal principal, CancellationToken cancellationToken = default);
}

/// <inheritdoc cref="IUserProvisioningService"/>
public class UserProvisioningService(AppDbContext db) : IUserProvisioningService
{
    // Claim types read from the session — mirrors App.Platform's MapAuthEndpoints (/api/auth/me).
    private const string ObjectIdClaim = "oid";
    private const string SubjectClaim = "sub";
    private const string NameClaim = "name";
    private const string EmailClaim = "email";

    /// <summary>Synthetic identity used in open mode — see core.md "IAM".</summary>
    public const string LocalDevOid = "local-dev";

    /// <summary>Display name of the open-mode synthetic User (CONTEXT.md "Utente").</summary>
    public const string LocalDevDisplayName = "Sviluppo locale";

    /// <inheritdoc/>
    public async System.Threading.Tasks.Task<User> GetOrCreateCurrentUserAsync(
        ClaimsPrincipal principal,
        CancellationToken cancellationToken = default)
    {
        var oid = principal.FindFirstValue(ObjectIdClaim) ?? principal.FindFirstValue(SubjectClaim);
        if (string.IsNullOrWhiteSpace(oid))
            return await GetOrCreateUserAsync(LocalDevOid, LocalDevDisplayName, email: null, cancellationToken);

        var displayName = principal.FindFirstValue(NameClaim);
        var email = principal.FindFirstValue(EmailClaim);
        return await GetOrCreateUserAsync(oid, displayName, email, cancellationToken);
    }

    /// <summary>
    /// Race-safe upsert by <paramref name="oid"/> — the one path both the real-identity branch
    /// and the open-mode synthetic User (<see cref="LocalDevOid"/>) go through, since both faced
    /// the same race: two concurrent requests for the same brand-new <paramref name="oid"/> (a
    /// User's very first sign-in, or the synthetic User's very first request) both read no
    /// existing row via <c>SingleOrDefaultAsync</c>, both <c>Add</c>, and only one
    /// <c>SaveChangesAsync</c> can win — <c>IX_Users_Oid</c>'s unique index rejects the loser with
    /// Postgres error 23505 (unique_violation), which used to surface as an unhandled 500.
    /// </summary>
    private async System.Threading.Tasks.Task<User> GetOrCreateUserAsync(
        string oid,
        string? displayName,
        string? email,
        CancellationToken cancellationToken)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Oid == oid, cancellationToken);
        if (user is null)
        {
            user = new User { Oid = oid, DisplayName = displayName, Email = email };
            db.Users.Add(user);

            try
            {
                await db.SaveChangesAsync(cancellationToken);
                return user;
            }
            catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
            {
                // The concurrent winner's row is now committed and visible. This context still
                // tracks `user` as Added — a failed SaveChangesAsync does not revert that — so it
                // must be detached first: left tracked, the re-query below would just hand back
                // this same (never-inserted) instance instead of hitting the database, and any
                // later SaveChangesAsync on this context would retry the same doomed insert.
                db.Entry(user).State = EntityState.Detached;
                return await db.Users.SingleAsync(u => u.Oid == oid, cancellationToken);
            }
        }

        user.DisplayName = displayName;
        user.Email = email;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
        return user;
    }
}
