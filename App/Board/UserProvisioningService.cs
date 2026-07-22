using System.Security.Claims;
using Microsoft.EntityFrameworkCore;

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
            return await GetOrCreateSyntheticUserAsync(cancellationToken);

        var displayName = principal.FindFirstValue(NameClaim);
        var email = principal.FindFirstValue(EmailClaim);

        var user = await db.Users.SingleOrDefaultAsync(u => u.Oid == oid, cancellationToken);
        if (user is null)
        {
            user = new User { Oid = oid, DisplayName = displayName, Email = email };
            db.Users.Add(user);
        }
        else
        {
            user.DisplayName = displayName;
            user.Email = email;
            user.UpdatedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(cancellationToken);
        return user;
    }

    private async System.Threading.Tasks.Task<User> GetOrCreateSyntheticUserAsync(CancellationToken cancellationToken)
    {
        var user = await db.Users.SingleOrDefaultAsync(u => u.Oid == LocalDevOid, cancellationToken);
        if (user is not null)
            return user;

        user = new User { Oid = LocalDevOid, DisplayName = LocalDevDisplayName };
        db.Users.Add(user);
        await db.SaveChangesAsync(cancellationToken);
        return user;
    }
}
