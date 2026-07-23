namespace App.Storage;

/// <summary>
/// Object storage for this App's folder inside the shared S3-compatible bucket (storage
/// capability). Callers pass bare keys — every key is automatically prefixed with the App's
/// <see cref="StorageOptions.Folder"/> before it reaches the bucket, so no caller can read, write,
/// or list outside the App's folder.
/// </summary>
public interface IObjectStore
{
    /// <summary>Uploads <paramref name="content"/> under <paramref name="key"/> with the given content type.</summary>
    /// <param name="key">The bare object key, without the App's folder prefix.</param>
    /// <param name="content">The object's content.</param>
    /// <param name="contentType">The MIME type stored alongside the object.</param>
    Task SaveAsync(string key, Stream content, string contentType, CancellationToken cancellationToken = default);

    /// <summary>Downloads the object at <paramref name="key"/>, or <c>null</c> if it does not exist.</summary>
    /// <param name="key">The bare object key, without the App's folder prefix.</param>
    Task<StoredObject?> ReadAsync(string key, CancellationToken cancellationToken = default);

    /// <summary>Deletes the object at <paramref name="key"/>. A no-op if it does not exist.</summary>
    /// <param name="key">The bare object key, without the App's folder prefix.</param>
    Task DeleteAsync(string key, CancellationToken cancellationToken = default);
}

/// <summary>An object read back from storage: its content stream and stored content type.</summary>
public sealed record StoredObject(Stream Content, string ContentType) : IDisposable
{
    /// <inheritdoc/>
    public void Dispose() => Content.Dispose();
}
