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
}
