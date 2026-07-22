import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { CommentsService } from '../comments';
import { Comment } from '../comment.model';
import { Task } from '../task.model';

/** Data the detail panel is opened with: the Task whose conversation it shows (ticket #18). */
export type TaskDetailDialogData = { task: Task };

// Same "not just whitespace" rule the Task title validator uses.
function notBlankValidator(control: AbstractControl<string>): ValidationErrors | null {
  return control.value?.trim() ? null : { required: true };
}

/**
 * Material detail panel opened from a Task card (ticket #18): shows the Task's conversation —
 * a flat, chronological list of Comments with author and date (CONTEXT.md "Commento") — and a
 * send box to write a new one.
 */
@Component({
  selector: 'app-task-detail-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    MatFormField,
    MatLabel,
    MatInput,
    MatButton,
  ],
  templateUrl: './task-detail-dialog.html',
  styleUrl: './task-detail-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskDetailDialog {
  private readonly commentsService = inject(CommentsService);
  protected readonly data = inject<TaskDetailDialogData>(MAT_DIALOG_DATA);

  protected readonly task = this.data.task;
  protected readonly comments = signal<Comment[]>([]);
  protected readonly loading = signal(true);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    body: ['', notBlankValidator],
  });

  protected sending = false;
  protected errorMessage: string | null = null;

  constructor() {
    this.refresh();
  }

  /** Italian-locale date+time, matching TaskCard's own due-date formatting approach. */
  protected formatTimestamp(iso: string): string {
    return new Date(iso).toLocaleString('it-IT', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private refresh(): void {
    this.commentsService.list(this.task.id).subscribe({
      next: (comments) => {
        this.comments.set(comments);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected submit(): void {
    if (this.sending) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.sending = true;
    this.errorMessage = null;
    const body = this.form.getRawValue().body.trim();

    this.commentsService.create(this.task.id, { body }).subscribe({
      next: () => {
        this.sending = false;
        this.form.reset({ body: '' });
        this.refresh();
      },
      error: () => {
        this.sending = false;
        this.errorMessage = 'Impossibile inviare il messaggio. Riprova.';
      },
    });
  }
}
