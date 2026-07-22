import { Component, ChangeDetectionStrategy, computed, input } from '@angular/core';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatIcon } from '@angular/material/icon';
import { Task } from '../task.model';
import { URGENCY_LABELS } from '../urgency';

/** Today at midnight, local time — DueDate carries no time component. */
function today(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

/** A single Task card: title, urgency badge, due date, comment/attachment counters. */
@Component({
  selector: 'app-task-card',
  imports: [MatCard, MatCardContent, MatIcon],
  templateUrl: './task-card.html',
  styleUrl: './task-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskCard {
  readonly task = input.required<Task>();

  protected readonly urgencyLabel = computed(() => URGENCY_LABELS[this.task().urgency]);

  protected readonly urgencyClass = computed(() => `urgency-${this.task().urgency.toLowerCase()}`);

  /** Formatted due date (Italian locale), or null when the Task has none. */
  protected readonly dueDateLabel = computed(() => {
    const dueDate = this.task().dueDate;
    if (!dueDate) return null;
    return new Date(`${dueDate}T00:00:00`).toLocaleDateString('it-IT', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  });

  /** True when the due date has passed and the Task is not yet Done. */
  protected readonly isOverdue = computed(() => {
    const dueDate = this.task().dueDate;
    if (!dueDate || this.task().status === 'Done') return false;
    return new Date(`${dueDate}T00:00:00`) < today();
  });

  // Comment/Attachment counters are always 0 in F1 — Comment and Attachment
  // do not exist as entities yet (CONTEXT.md), wired up in a later feature.
  protected readonly commentCount = 0;
  protected readonly attachmentCount = 0;
}
