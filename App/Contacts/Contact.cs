namespace App.Contacts;

/// <summary>Rubrica contact entry.</summary>
public class Contact
{
    /// <summary>Unique identifier.</summary>
    public Guid Id { get; init; } = Guid.CreateVersion7();

    /// <summary>First name.</summary>
    public required string FirstName { get; set; }

    /// <summary>Last name.</summary>
    public required string LastName { get; set; }

    /// <summary>Email address.</summary>
    public string? Email { get; set; }

    /// <summary>Phone number.</summary>
    public string? Phone { get; set; }

    /// <summary>Company or organisation.</summary>
    public string? Company { get; set; }

    /// <summary>Role or job title.</summary>
    public string? Role { get; set; }

    /// <summary>UTC timestamp of creation.</summary>
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;

    /// <summary>UTC timestamp of last update.</summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
