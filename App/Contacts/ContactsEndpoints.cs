using Microsoft.EntityFrameworkCore;

namespace App.Contacts;

/// <summary>CRUD endpoints for the Contacts resource.</summary>
public static class ContactsEndpoints
{
    // Category used for all log records emitted by this class.
    // ILoggerFactory.CreateLogger(string) caches loggers — no allocation on each call.
    private const string LogCategory = "App.Contacts";

    /// <summary>Registers all /api/contacts routes on the given <see cref="WebApplication"/>.</summary>
    public static void MapContacts(this WebApplication app)
    {
        var group = app.MapGroup("/api/contacts").WithTags("Contacts");

        // Roles come from the AppRoles constants — the `value`s declared in roles.json, carried
        // verbatim by the portal contract's role claim (core.md, "Roles and authorization").
        // Reads need no role: the platform's fallback policy already requires an authenticated
        // session.
        group.MapGet("/", ListContacts);
        group.MapGet("/{id:guid}", GetContact);
        group.MapPost("/", CreateContact)
             .RequireAuthorization(policy => policy.RequireRole(AppRoles.ContactsWriter, AppRoles.ContactsAdmin));
        group.MapPut("/{id:guid}", UpdateContact)
             .RequireAuthorization(policy => policy.RequireRole(AppRoles.ContactsWriter, AppRoles.ContactsAdmin));
        group.MapDelete("/{id:guid}", DeleteContact)
             .RequireAuthorization(policy => policy.RequireRole(AppRoles.ContactsAdmin));
    }

    // ── Compiled log actions (zero-allocation structured logging) ─────────────

    private static readonly Action<ILogger, string?, int, Exception?> _contactsListed =
        LoggerMessage.Define<string?, int>(
            LogLevel.Information,
            new EventId(1001, "ContactsListed"),
            "Contacts listed — search={SearchTerm} count={Count}");

    private static readonly Action<ILogger, Guid, Exception?> _contactFound =
        LoggerMessage.Define<Guid>(
            LogLevel.Debug,
            new EventId(1002, "ContactFound"),
            "Contact retrieved — id={ContactId}");

    private static readonly Action<ILogger, Guid, Exception?> _contactNotFound =
        LoggerMessage.Define<Guid>(
            LogLevel.Warning,
            new EventId(1003, "ContactNotFound"),
            "Contact not found — id={ContactId}");

    private static readonly Action<ILogger, Guid, string, string, Exception?> _contactCreated =
        LoggerMessage.Define<Guid, string, string>(
            LogLevel.Information,
            new EventId(1004, "ContactCreated"),
            "Contact created — id={ContactId} firstName={FirstName} lastName={LastName}");

    private static readonly Action<ILogger, Guid, Exception?> _contactUpdated =
        LoggerMessage.Define<Guid>(
            LogLevel.Information,
            new EventId(1005, "ContactUpdated"),
            "Contact updated — id={ContactId}");

    private static readonly Action<ILogger, Guid, Exception?> _contactDeleted =
        LoggerMessage.Define<Guid>(
            LogLevel.Information,
            new EventId(1006, "ContactDeleted"),
            "Contact deleted — id={ContactId}");

    // ── Handlers ──────────────────────────────────────────────────────────────

    /// <summary>Returns all contacts, optionally filtered by a search term.</summary>
    private static async Task<IResult> ListContacts(
        AppDbContext db,
        ILoggerFactory loggerFactory,
        string? q)
    {
        var logger = loggerFactory.CreateLogger(LogCategory);
        var query = db.Contacts.AsQueryable();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var term = q.Trim().ToLower();
            query = query.Where(c =>
                c.FirstName.ToLower().Contains(term) ||
                c.LastName.ToLower().Contains(term) ||
                (c.Email != null && c.Email.ToLower().Contains(term)) ||
                (c.Company != null && c.Company.ToLower().Contains(term)));
        }

        var contacts = await query
            .OrderBy(c => c.LastName)
            .ThenBy(c => c.FirstName)
            .ToListAsync();

        _contactsListed(logger, q, contacts.Count, null);
        return Results.Ok(contacts);
    }

    /// <summary>Returns a single contact by id.</summary>
    private static async Task<IResult> GetContact(
        Guid id,
        AppDbContext db,
        ILoggerFactory loggerFactory)
    {
        var logger = loggerFactory.CreateLogger(LogCategory);
        var contact = await db.Contacts.FindAsync(id);

        if (contact is null)
        {
            _contactNotFound(logger, id, null);
            return Results.NotFound();
        }

        _contactFound(logger, id, null);
        return Results.Ok(contact);
    }

    /// <summary>Creates a new contact.</summary>
    private static async Task<IResult> CreateContact(
        CreateContactRequest request,
        AppDbContext db,
        ILoggerFactory loggerFactory)
    {
        var logger = loggerFactory.CreateLogger(LogCategory);
        var contact = new Contact
        {
            FirstName = request.FirstName,
            LastName = request.LastName,
            Email = request.Email,
            Phone = request.Phone,
            Company = request.Company,
            Role = request.Role,
        };

        db.Contacts.Add(contact);
        await db.SaveChangesAsync();

        _contactCreated(logger, contact.Id, contact.FirstName, contact.LastName, null);
        return Results.Created($"/api/contacts/{contact.Id}", contact);
    }

    /// <summary>Updates an existing contact.</summary>
    private static async Task<IResult> UpdateContact(
        Guid id,
        UpdateContactRequest request,
        AppDbContext db,
        ILoggerFactory loggerFactory)
    {
        var logger = loggerFactory.CreateLogger(LogCategory);
        var contact = await db.Contacts.FindAsync(id);

        if (contact is null)
        {
            _contactNotFound(logger, id, null);
            return Results.NotFound();
        }

        contact.FirstName = request.FirstName;
        contact.LastName = request.LastName;
        contact.Email = request.Email;
        contact.Phone = request.Phone;
        contact.Company = request.Company;
        contact.Role = request.Role;
        contact.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
        _contactUpdated(logger, id, null);
        return Results.Ok(contact);
    }

    /// <summary>Deletes a contact by id.</summary>
    private static async Task<IResult> DeleteContact(
        Guid id,
        AppDbContext db,
        ILoggerFactory loggerFactory)
    {
        var logger = loggerFactory.CreateLogger(LogCategory);
        var contact = await db.Contacts.FindAsync(id);

        if (contact is null)
        {
            _contactNotFound(logger, id, null);
            return Results.NotFound();
        }

        db.Contacts.Remove(contact);
        await db.SaveChangesAsync();
        _contactDeleted(logger, id, null);
        return Results.NoContent();
    }
}

/// <summary>Payload for creating a contact.</summary>
public record CreateContactRequest(
    string FirstName,
    string LastName,
    string? Email,
    string? Phone,
    string? Company,
    string? Role);

/// <summary>Payload for updating a contact.</summary>
public record UpdateContactRequest(
    string FirstName,
    string LastName,
    string? Email,
    string? Phone,
    string? Company,
    string? Role);
