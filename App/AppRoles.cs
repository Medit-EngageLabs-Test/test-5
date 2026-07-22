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
    /// <summary>Full access to contacts including deletion. Includes all Contacts.Writer permissions.</summary>
    public const string ContactsAdmin = "Contacts.Admin";

    /// <summary>Can create and edit contacts, but cannot delete them.</summary>
    public const string ContactsWriter = "Contacts.Writer";
}
