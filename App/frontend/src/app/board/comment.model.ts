/**
 * A message in a Task's conversation (CONTEXT.md "Commento"), as returned by
 * `GET/POST /api/tasks/{taskId}/comments` — already server-ordered chronologically.
 */
export interface Comment {
  id: string;
  taskId: string;
  body: string;
  authorId: string;
  /** Resolved server-side: DisplayName, falling back to Email, falling back to "Utente". */
  authorDisplayName: string;
  createdAt: string;
  /** Non-null once the author has edited this Comment (ticket #19). */
  editedAt: string | null;
}

/** Body of `POST /api/tasks/{taskId}/comments` (ticket #18): only `body` is required. */
export interface CreateCommentRequest {
  body: string;
}
