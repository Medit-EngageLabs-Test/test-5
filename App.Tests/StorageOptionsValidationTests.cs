using Microsoft.AspNetCore.Hosting;

namespace App.Tests;

/// <summary>
/// Boots the App with one of the six <c>Storage__*</c> settings blanked out, to verify the
/// no-fallback guardrail of the storage capability: <see cref="Storage.StorageOptions"/> is bound
/// with <c>ValidateDataAnnotations().ValidateOnStart()</c>, so a missing value must fail App
/// startup rather than silently default to a local endpoint.
/// </summary>
public sealed class MissingStorageEndpointAppFactory : AppFactory
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        base.ConfigureWebHost(builder);
        builder.UseSetting("Storage:Endpoint", string.Empty);
    }
}

/// <summary>Verifica l'attivazione della Capability storage: l'assenza di una variabile Storage__* blocca l'avvio.</summary>
public class StorageOptionsValidationTests
{
    [Fact]
    public void AvvioApp_ConVariabileStorageMancante_Fallisce()
    {
        using var factory = new MissingStorageEndpointAppFactory();

        var exception = Record.Exception(() => factory.Server);

        Assert.NotNull(exception);
        Assert.Contains("Storage", exception.ToString(), StringComparison.OrdinalIgnoreCase);
    }
}
