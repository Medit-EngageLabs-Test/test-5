using App.Contacts;
using Microsoft.EntityFrameworkCore;

namespace App;

/// <summary>EF Core database context for this application.</summary>
public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    /// <summary>Contacts table.</summary>
    public DbSet<Contact> Contacts => Set<Contact>();
}
