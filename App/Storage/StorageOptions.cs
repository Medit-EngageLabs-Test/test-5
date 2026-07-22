using System.ComponentModel.DataAnnotations;

namespace App.Storage;

/// <summary>
/// Binds the "Storage" configuration section (the storage capability's S3-compatible bucket).
/// Every property is required: in production the six <c>Storage__*</c> environment variables are
/// injected by IntelliFlow with no fallback (portal contract) — a missing one must fail App
/// startup via <c>ValidateOnStart()</c> rather than silently default to a local endpoint.
/// </summary>
public class StorageOptions
{
    /// <summary>S3-compatible endpoint URL (e.g. <c>http://minio:9000</c>).</summary>
    [Required(AllowEmptyStrings = false)]
    public string Endpoint { get; set; } = string.Empty;

    /// <summary>Name of the shared bucket. Shared with other Apps — never the App's alone.</summary>
    [Required(AllowEmptyStrings = false)]
    public string BucketName { get; set; } = string.Empty;

    /// <summary>The folder reserved for this App inside the shared bucket. Every object key is prefixed with it.</summary>
    [Required(AllowEmptyStrings = false)]
    public string Folder { get; set; } = string.Empty;

    /// <summary>Access key for the shared bucket.</summary>
    [Required(AllowEmptyStrings = false)]
    public string AccessKey { get; set; } = string.Empty;

    /// <summary>Secret key for the shared bucket.</summary>
    [Required(AllowEmptyStrings = false)]
    public string SecretKey { get; set; } = string.Empty;

    /// <summary>AWS region (use <c>us-east-1</c> for MinIO unless the Operator specifies otherwise).</summary>
    [Required(AllowEmptyStrings = false)]
    public string Region { get; set; } = string.Empty;
}
