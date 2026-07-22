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
import { MatSnackBar } from '@angular/material/snack-bar';
import { CommentsService } from '../comments';
import { Comment } from '../comment.model';
import { Task } from '../task.model';
import { AttachmentsService } from '../attachments';
import { Attachment } from '../attachment.model';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';

/** How long an attachment result snackbar stays on screen (ticket #20). */
const SNACK_BAR_DURATION_MS = 3000;

/**
 * UI-only hint for the file picker — the server (`AttachmentValidation.AllowedContentTypes`) is
 * the actual whitelist enforced on upload; this just steers the OS file dialog (ticket #20).
 */
const ACCEPTED_FILE_TYPES =
  'image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/csv,.doc,.docx,.xls,.xlsx,.zip';

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
  private readonly attachmentsService = inject(AttachmentsService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly data = inject<TaskDetailDialogData>(MAT_DIALOG_DATA);

  protected readonly task = this.data.task;
  protected readonly comments = signal<Comment[]>([]);
  protected readonly loading = signal(true);

  // Ticket #20: every Attachment of this Task, direct or on one of its Comments (ticket #21) —
  // taskAttachments()/attachmentsFor(commentId) below partition this same list instead of the
  // frontend making a second, per-comment request.
  protected readonly attachments = signal<Attachment[]>([]);
  protected readonly uploadingTaskAttachment = signal(false);
  protected readonly acceptedFileTypes = ACCEPTED_FILE_TYPES;

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
    this.attachmentsService.list(this.task.id).subscribe({
      next: (attachments) => this.attachments.set(attachments),
      // Best-effort: a listing failure should not block the conversation above from loading.
      error: () => undefined,
    });
  }

  /** This Task's own Attachments — excludes those uploaded to one of its Comments (ticket #21). */
  protected taskAttachments(): Attachment[] {
    return this.attachments().filter((attachment) => attachment.commentId === null);
  }

  /** The Attachments uploaded to one specific Comment (ticket #21). */
  protected attachmentsFor(commentId: string): Attachment[] {
    return this.attachments().filter((attachment) => attachment.commentId === commentId);
  }

  /** Human-readable file size, e.g. "128 KB" (ticket #20). */
  protected formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** URL to download an Attachment's content, proxied by the backend (ticket #20). */
  protected downloadUrl(attachmentId: string): string {
    return this.attachmentsService.downloadUrl(attachmentId);
  }

  /**
   * Uploads the file picked from the Task-level file input (ticket #20). Resets the input's value
   * afterwards so selecting the very same file again still fires a `change` event.
   */
  protected onTaskFileSelected(event: Event, input: HTMLInputElement): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    input.value = '';
    if (!file) return;

    this.uploadingTaskAttachment.set(true);
    this.attachmentsService.uploadToTask(this.task.id, file).subscribe({
      next: () => {
        this.uploadingTaskAttachment.set(false);
        this.refresh();
        this.snackBar.open('Allegato caricato.', 'Chiudi', { duration: SNACK_BAR_DURATION_MS });
      },
      error: () => {
        this.uploadingTaskAttachment.set(false);
        this.snackBar.open('Impossibile caricare l’allegato.', 'Chiudi', {
          duration: SNACK_BAR_DURATION_MS,
        });
      },
    });
  }

  /**
   * Uploads the file picked from a Comment's own file input (ticket #21). Resets the input's
   * value afterwards so selecting the very same file again still fires a `change` event.
   */
  protected onCommentFileSelected(event: Event, comment: Comment, input: HTMLInputElement): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    input.value = '';
    if (!file) return;

    this.attachmentsService.uploadToComment(comment.id, file).subscribe({
      next: () => {
        this.refresh();
        this.snackBar.open('Allegato caricato.', 'Chiudi', { duration: SNACK_BAR_DURATION_MS });
      },
      error: () =>
        this.snackBar.open('Impossibile caricare l’allegato.', 'Chiudi', {
          duration: SNACK_BAR_DURATION_MS,
        }),
    });
  }

  /**
   * Confirms then deletes an Attachment (ticket #22) — the remove command itself is only ever
   * rendered when `attachment.canDelete` (uploader or Board Moderator).
   */
  protected async confirmDeleteAttachment(attachment: Attachment): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'Eliminare questo allegato?',
      message: `«${attachment.fileName}» sarà eliminato definitivamente.`,
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!confirmed) return;

    this.attachmentsService.remove(attachment.id).subscribe({
      next: () => {
        this.refresh();
        this.snackBar.open('Allegato eliminato.', 'Chiudi', { duration: SNACK_BAR_DURATION_MS });
      },
      error: () =>
        this.snackBar.open('Impossibile eliminare l’allegato.', 'Chiudi', {
          duration: SNACK_BAR_DURATION_MS,
        }),
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
