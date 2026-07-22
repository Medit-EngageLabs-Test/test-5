import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatError, MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatOption } from '@angular/material/core';
import { MatSelect } from '@angular/material/select';
import { TasksService } from '../tasks';
import { Task, TaskUrgency } from '../task.model';
import { URGENCY_LABELS, URGENCY_VALUES } from '../urgency';

/**
 * What the dialog was opened for: creating a Task from scratch (ticket #14) or editing an
 * existing one (ticket #15) — the same form either way, per the ticket's "riusa il form".
 */
export type TaskFormDialogData = { mode: 'create' } | { mode: 'edit'; task: Task };

// Title must not be blank, but a couple of leading/trailing spaces alone must not pass either
// (Validators.required only rejects "", not "   ") — mirrors the backend's own check.
function notBlankValidator(control: AbstractControl<string>): ValidationErrors | null {
  return control.value?.trim() ? null : { required: true };
}

/**
 * Material form dialog to create or edit a Task: title (required), description, urgency,
 * due date. Reused unchanged between the two tickets — only the submit target and the initial
 * values differ, driven by `data.mode`.
 */
@Component({
  selector: 'app-task-form-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatFormField,
    MatLabel,
    MatError,
    MatInput,
    MatSelect,
    MatOption,
    MatButton,
  ],
  templateUrl: './task-form-dialog.html',
  styleUrl: './task-form-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskFormDialog {
  private readonly dialogRef = inject(MatDialogRef<TaskFormDialog, boolean>);
  private readonly tasksService = inject(TasksService);
  protected readonly data = inject<TaskFormDialogData>(MAT_DIALOG_DATA);

  protected readonly isEdit = this.data.mode === 'edit';
  protected readonly dialogTitle = this.isEdit ? 'Modifica Attività' : 'Nuova Attività';
  protected readonly submitLabel = this.isEdit ? 'Salva' : 'Crea';
  protected readonly urgencyOptions = URGENCY_VALUES.map((value) => ({
    value,
    label: URGENCY_LABELS[value],
  }));

  protected readonly form = inject(FormBuilder).nonNullable.group({
    title: [this.data.mode === 'edit' ? this.data.task.title : '', notBlankValidator],
    description: [(this.data.mode === 'edit' ? this.data.task.description : null) as string | null],
    urgency: [
      (this.data.mode === 'edit' ? this.data.task.urgency : 'Medium') as TaskUrgency,
      Validators.required,
    ],
    dueDate: [(this.data.mode === 'edit' ? this.data.task.dueDate : null) as string | null],
  });

  protected saving = false;
  protected errorMessage: string | null = null;

  protected submit(): void {
    if (this.saving) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving = true;
    this.errorMessage = null;
    const value = this.form.getRawValue();
    const request = {
      title: value.title.trim(),
      description: value.description?.trim() || null,
      urgency: value.urgency,
      dueDate: value.dueDate || null,
    };

    const save$ =
      this.data.mode === 'create'
        ? this.tasksService.create(request)
        : this.tasksService.update(this.data.task.id, request);

    save$.subscribe({
      next: () => this.dialogRef.close(true),
      error: () => {
        this.saving = false;
        this.errorMessage = 'Impossibile salvare l’Attività. Riprova.';
      },
    });
  }

  protected cancel(): void {
    this.dialogRef.close(false);
  }
}
