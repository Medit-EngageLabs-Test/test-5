import { Component, ChangeDetectionStrategy, computed, input, output } from '@angular/core';
import { MatCard, MatCardContent } from '@angular/material/card';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
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
  imports: [MatCard, MatCardContent, MatIcon, MatIconButton],
  templateUrl: './task-card.html',
  styleUrl: './task-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskCard {
  readonly task = input.required<Task>();

  /** Emitted when the edit command is activated — allowed to any authenticated User (ticket #15). */
  readonly editRequested = output<void>();

  /** Emitted when the delete command is activated — only rendered when `task().canDelete` (ticket #17). */
  readonly deleteRequested = output<void>();

  /** Emitted when the card itself is activated (click or keyboard) — opens the detail panel (ticket #18). */
  readonly detailsRequested = output<void>();

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

  // Server-computed — the 💬 badge (ticket #18) and 📎 badge (ticket #20).
  protected readonly commentCount = computed(() => this.task().commentCount);
  protected readonly attachmentCount = computed(() => this.task().attachmentCount);

  // stopPropagation: the card sits inside a cdkDrag wrapper (ticket #16) — without it, pressing
  // these buttons could be interpreted as the start of a drag gesture by the CDK listeners above,
  // and the click would also bubble up to onCardClick() and open the detail panel underneath.
  protected onDetailsClick(event: Event): void {
    event.stopPropagation();
    this.detailsRequested.emit();
  }

  protected onEditClick(event: Event): void {
    event.stopPropagation();
    this.editRequested.emit();
  }

  protected onDeleteClick(event: Event): void {
    event.stopPropagation();
    this.deleteRequested.emit();
  }

  /**
   * Opens the detail panel on a plain card click — mouse-only convenience. The card is not a
   * keyboard-focusable control (no role="button"/tabindex): it contains the edit/delete/details
   * buttons above, and a focusable container around other focusable controls is a WCAG
   * nested-interactive violation (AGENTS.md binds WCAG 2.1 AA). Keyboard/AT users get the same
   * outcome through the explicit "Apri dettaglio Attività" button instead.
   */
  protected onCardClick(): void {
    this.detailsRequested.emit();
  }
}
