namespace App;

/// <summary>
/// The role values declared in <c>.intelliflow/iam/roles.json</c>, as typed constants: reference
/// these in <c>RequireRole</c>/authorization policies instead of role-string literals, so a role
/// renamed or removed in <c>roles.json</c> becomes a compile error instead of a silently dead check.
/// </summary>
/// <remarks>
/// Hand-maintained mirror of <c>roles.json</c>: whenever a role is added, renamed or removed there,
/// update this class in the same commit — <c>AppRolesAlignmentTests</c> (App.Tests) fails when the
/// two diverge. The alignment test checks only the <c>value</c>s: the XML doc summaries mirror the
/// roles' <c>description</c>s and must be kept aligned by hand too. The frontend twin
/// (<c>App/frontend/src/app/auth/app-roles.generated.ts</c>) is regenerated from <c>roles.json</c>
/// at every build instead.
/// </remarks>
public static class AppRoles
{
    /// <summary>Full moderation rights on the Board: can manage any Task regardless of who created it.</summary>
    public const string BoardModerator = "Board.Moderator";
}
