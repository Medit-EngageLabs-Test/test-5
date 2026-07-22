using System.Reflection;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Infrastructure;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace App.Tests;

/// <summary>
/// Verifies that the hand-maintained <see cref="AppRoles"/> constants mirror
/// <c>.intelliflow/iam/roles.json</c> — the single source of truth for the App's roles (portal
/// contract, core.md "Roles and authorization"). If this test fails, a role was added, renamed or
/// removed in one of the two without updating the other: align <c>App/AppRoles.cs</c> with
/// <c>roles.json</c> in the same commit.
/// </summary>
public class AppRolesAlignmentTests
{
    [Fact]
    public void AppRolesConstants_MirrorRolesJson()
    {
        var declaredValues = RolesJsonDeclaration.Values();

        var constantValues = typeof(AppRoles)
            .GetFields(BindingFlags.Public | BindingFlags.Static)
            .Where(field => field.IsLiteral && field.FieldType == typeof(string))
            .Select(field => (string?)field.GetRawConstantValue())
            .ToList();

        Assert.Equal(
            declaredValues.OrderBy(value => value, StringComparer.Ordinal),
            constantValues.OrderBy(value => value, StringComparer.Ordinal));
    }
}

/// <summary>
/// Verifies that every role required by an endpoint's authorization policy is declared in
/// <c>.intelliflow/iam/roles.json</c>. Unlike the constants mirror above, this inspects the
/// endpoint metadata the middleware actually enforces, so it catches role-string literals passed
/// to <c>RequireRole</c> that were never declared anywhere — an App shipping such an endpoint has
/// a permanently inaccessible route, because the portal can only assign declared roles.
/// The reverse is not asserted: a declared role may legitimately gate only the frontend.
/// Imperative checks inside handlers (<c>User.IsInRole</c>, ad-hoc <c>IAuthorizationService</c>
/// calls) carry no endpoint metadata and are not covered — prefer policy-based authorization.
/// </summary>
public class EndpointRolesAlignmentTests(AppFactory factory) : IClassFixture<AppFactory>
{
    [Fact]
    public void RolesRequiredByEndpoints_AreDeclaredInRolesJson()
    {
        var declaredValues = RolesJsonDeclaration.Values();

        var requiredRoles = factory.Services.GetRequiredService<EndpointDataSource>().Endpoints
            .SelectMany(RolesRequiredBy)
            .Distinct()
            .ToList();

        var undeclaredRoles = requiredRoles.Where(role => !declaredValues.Contains(role)).ToList();
        Assert.True(
            undeclaredRoles.Count == 0,
            $"Roles required by endpoints but never declared in roles.json: {string.Join(", ", undeclaredRoles)}");
    }

    private static IEnumerable<string> RolesRequiredBy(Endpoint endpoint)
    {
        // Inline policies (RequireAuthorization(policy => policy.RequireRole(...))) land in the
        // endpoint metadata as the built AuthorizationPolicy; attribute-based roles
        // ([Authorize(Roles = "...")]) as IAuthorizeData with a comma-separated list.
        var policyRoles = endpoint.Metadata.OfType<AuthorizationPolicy>()
            .SelectMany(policy => policy.Requirements)
            .OfType<RolesAuthorizationRequirement>()
            .SelectMany(requirement => requirement.AllowedRoles);

        var attributeRoles = endpoint.Metadata.OfType<IAuthorizeData>()
            .Select(authorizeData => authorizeData.Roles)
            .Where(roles => !string.IsNullOrEmpty(roles))
            .SelectMany(roles => roles!.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries));

        return policyRoles.Concat(attributeRoles);
    }
}

/// <summary>
/// Reads the role values declared in <c>roles.json</c>, copied next to the test assembly by
/// App.Tests.csproj so the tests are independent of the runner's working directory.
/// </summary>
file static class RolesJsonDeclaration
{
    public static IReadOnlyList<string?> Values()
    {
        var rolesJsonPath = Path.Combine(AppContext.BaseDirectory, "roles.json");
        using var rolesDocument = JsonDocument.Parse(File.ReadAllText(rolesJsonPath));
        return rolesDocument.RootElement.EnumerateArray()
            .Select(role => role.GetProperty("value").GetString())
            .ToList();
    }
}
