import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
} from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatIcon } from '@angular/material/icon';
import { CommentsService } from '../comments';
import { Comment } from '../comment.model';
import { Task } from '../task.model';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';

/** Data the detail panel is opened with: the Task whose conversation it shows (ticket #18). */
export interface TaskDetailDialogData {
  task: Task;
}

// Same "not just whitespace" rule the Task title validator uses.
function notBlankValidator(control: AbstractControl<string>): ValidationErrors | null {
  return control.value?.trim() ? null : { required: true };
}

/**
 * Material detail panel opened from a Task card (ticket #18): shows the Task's conversation —
 * a flat, chronological list of Comments with author and date (CONTEXT.md "Commento") — and a
 * send box to write a new one. Edit/delete actions (ticket #19) are visible per Comment
 * according to the server-computed `canEdit`/`canDelete` flags.
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
    MatIconButton,
    MatIcon,
  ],
  templateUrl: './task-detail-dialog.html',
  styleUrl: './task-detail-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskDetailDialog {
  private readonly commentsService = inject(CommentsService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  protected readonly data = inject<TaskDetailDialogData>(MAT_DIALOG_DATA);

  protected readonly task = this.data.task;
  protected readonly comments = signal<Comment[]>([]);
  protected readonly loading = signal(true);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    body: ['', notBlankValidator],
  });

  protected sending = false;
  protected errorMessage: string | null = null;

  // Id of the Comment currently in inline edit mode, or null when none is (ticket #19).
  protected readonly editingCommentId = signal<string | null>(null);
  protected readonly editForm = inject(FormBuilder).nonNullable.group({
    body: ['', notBlankValidator],
  });
  protected editErrorMessage: string | null = null;

  /** Loads the Task's conversation as soon as the panel opens. */
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

  /** Enters inline edit mode for a Comment (ticket #19) — only ever invoked when `canEdit`. */
  protected startEdit(comment: Comment): void {
    this.editErrorMessage = null;
    this.editingCommentId.set(comment.id);
    this.editForm.setValue({ body: comment.body });
  }

  protected cancelEdit(): void {
    this.editingCommentId.set(null);
  }

  /** Saves an inline edit (ticket #19): sets EditedAt server-side — "(modificato)" follows from it. */
  protected saveEdit(comment: Comment): void {
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const body = this.editForm.getRawValue().body.trim();
    this.commentsService.update(comment.id, { body }).subscribe({
      next: () => {
        this.editingCommentId.set(null);
        this.refresh();
      },
      error: () => {
        this.editErrorMessage = 'Impossibile modificare il messaggio. Riprova.';
      },
    });
  }

  /**
   * Confirms then deletes a Comment (ticket #19) — the delete command itself is only ever
   * rendered when `comment.canDelete` (author or Board Moderator). commentCount on the Board
   * card refreshes once this panel closes (Board.openDetailDialog's afterClosed).
   */
  protected async confirmDelete(comment: Comment): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'Eliminare questo messaggio?',
      message: 'Il messaggio sarà eliminato definitivamente.',
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!confirmed) return;

    this.commentsService.remove(comment.id).subscribe({
      next: () => this.refresh(),
      error: () => {
        this.errorMessage = 'Impossibile eliminare il messaggio. Riprova.';
      },
    });
  }
}
