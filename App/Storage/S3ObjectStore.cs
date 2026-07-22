using System.Net;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;

namespace App.Storage;

/// <summary>
/// <see cref="IObjectStore"/> implementation backed by <see cref="IAmazonS3"/>. The only place in
/// the App that talks to the shared bucket — every key is confined to <see cref="StorageOptions.Folder"/>.
/// </summary>
public sealed class S3ObjectStore(IAmazonS3 s3, IOptions<StorageOptions> options) : IObjectStore
{
    private readonly StorageOptions _options = options.Value;

    /// <inheritdoc/>
    public async Task SaveAsync(string key, Stream content, string contentType, CancellationToken cancellationToken = default)
    {
        var request = new PutObjectRequest
        {
            BucketName = _options.BucketName,
            Key = FolderScopedKey(key),
            InputStream = content,
            ContentType = contentType,
            AutoCloseStream = false, // the caller owns the stream's lifetime
        };
        await s3.PutObjectAsync(request, cancellationToken);
    }

    /// <inheritdoc/>
    public async Task<StoredObject?> ReadAsync(string key, CancellationToken cancellationToken = default)
    {
        try
        {
            var response = await s3.GetObjectAsync(_options.BucketName, FolderScopedKey(key), cancellationToken);
            return new StoredObject(response.ResponseStream, response.Headers.ContentType);
        }
        catch (AmazonS3Exception ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }

    /// <inheritdoc/>
    public async Task DeleteAsync(string key, CancellationToken cancellationToken = default) =>
        await s3.DeleteObjectAsync(_options.BucketName, FolderScopedKey(key), cancellationToken);

    /// <summary>Prefixes <paramref name="key"/> with the App's folder — see the storage capability's folder discipline guardrail.</summary>
    private string FolderScopedKey(string key) => $"{_options.Folder}/{key}";
}
