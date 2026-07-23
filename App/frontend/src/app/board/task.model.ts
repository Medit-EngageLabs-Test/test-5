/** The Board column a Task sits in — Stato in the domain glossary (CONTEXT.md). */
export type TaskStatus = 'ToDo' | 'Doing' | 'Done';

/** Task priority — Urgenza in the domain glossary (CONTEXT.md). */
export type TaskUrgency = 'Low' | 'Medium' | 'High';

/**
 * A Task as returned by `GET /api/tasks`, already ordered per ADR-0002
 * (Urgency High→Low, then DueDate ascending with no-due-date last, then CreatedAt descending).
 */
export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  urgency: TaskUrgency;
  /** ISO date (yyyy-MM-dd), no time component. */
  dueDate: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Server-computed: true only for the Task's creator or a Board Moderator (ticket #17).
   * `createdById` is the App's internal User id, not the signed-in user's Entra `oid`, so the
   * frontend cannot derive this itself — it only ever reads this flag to show/hide the delete
   * command.
   */
  canDelete: boolean;
  /** How many Comments this Task's conversation has (ticket #18) — the 💬 badge on the card. */
  commentCount: number;
  /**
   * How many Attachments this Task has (ticket #20) — the 📎 badge on the card. Includes
   * Attachments uploaded to any of the Task's Comments too (ticket #21).
   */
  attachmentCount: number;
}

/** Body of `POST /api/tasks` (ticket #14): only `title` is required. */
export interface CreateTaskRequest {
  title: string;
  description: string | null;
  urgency: TaskUrgency | null;
  dueDate: string | null;
}

/** Body of `PUT /api/tasks/{id}` (ticket #15): a full field replacement except `status`. */
export interface UpdateTaskRequest {
  title: string;
  description: string | null;
  urgency: TaskUrgency;
  dueDate: string | null;
}
