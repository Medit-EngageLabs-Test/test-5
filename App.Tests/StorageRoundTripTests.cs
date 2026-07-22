using System.Text;
using App.Storage;
using Microsoft.Extensions.DependencyInjection;

namespace App.Tests;

/// <summary>
/// Round-trips an object through <see cref="IObjectStore"/> against the real MinIO of the dev
/// compose stack (storage capability). The key carries a <see cref="Guid"/> so repeated runs
/// against the same, persistent bucket never collide, and the object is always deleted again —
/// this test must leave no trace behind, whether it passes or fails.
/// </summary>
public class StorageRoundTripTests(AppFactory factory) : IClassFixture<AppFactory>
{
    [Fact]
    public async Task SaveReadDelete_RoundTrip_RestituisceLoStessoContenutoENonLasciaTracce()
    {
        var store = factory.Services.GetRequiredService<IObjectStore>();
        var key = $"storage-round-trip-tests/{Guid.NewGuid()}.txt";
        var content = Encoding.UTF8.GetBytes($"round trip {Guid.NewGuid()}");

        try
        {
            using (var writeStream = new MemoryStream(content))
            {
                await store.SaveAsync(key, writeStream, "text/plain");
            }

            using var read = await store.ReadAsync(key);
            Assert.NotNull(read);
            Assert.Equal("text/plain", read!.ContentType);

            using var buffer = new MemoryStream();
            await read.Content.CopyToAsync(buffer);
            Assert.Equal(content, buffer.ToArray());
        }
        finally
        {
            await store.DeleteAsync(key);
        }

        var afterDelete = await store.ReadAsync(key);
        Assert.Null(afterDelete);
    }
}
