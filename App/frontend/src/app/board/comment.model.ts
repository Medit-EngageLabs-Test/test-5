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
  /**
   * Server-computed (ticket #19): true only for the Comment's own author — no Moderator
   * override, unlike `canDelete`. `authorId` is the App's internal User id, not the signed-in
   * user's Entra `oid`, so the frontend cannot derive this itself.
   */
  canEdit: boolean;
  /** Server-computed (ticket #19): true for the Comment's author or a Board Moderator. */
  canDelete: boolean;
}

/** Body of `POST /api/tasks/{taskId}/comments` (ticket #18): only `body` is required. */
export interface CreateCommentRequest {
  body: string;
}

/** Body of `PUT /api/comments/{id}` (ticket #19): only its author may call this — 403 otherwise. */
export interface UpdateCommentRequest {
  body: string;
}
