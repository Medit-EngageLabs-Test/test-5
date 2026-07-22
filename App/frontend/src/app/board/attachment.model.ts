/**
 * A file uploaded to a Task or one of its Comments (CONTEXT.md "Allegato"), as returned by
 * `GET /api/tasks/{taskId}/attachments` (ticket #20).
 */
export interface Attachment {
  id: string;
  taskId: string;
  /** Non-null when the Attachment belongs to one Comment of this Task (ticket #21). */
  commentId: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedById: string;
  createdAt: string;
}
