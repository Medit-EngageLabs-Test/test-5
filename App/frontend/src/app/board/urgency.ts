import { TaskUrgency } from './task.model';

/** Italian display label for each Urgency value (CONTEXT.md "Urgenza"). */
export const URGENCY_LABELS: Record<TaskUrgency, string> = {
  Low: 'Bassa',
  Medium: 'Media',
  High: 'Alta',
};

/** Every Urgency value, Low→High — the order used to populate the urgency select. */
export const URGENCY_VALUES: readonly TaskUrgency[] = ['Low', 'Medium', 'High'];
