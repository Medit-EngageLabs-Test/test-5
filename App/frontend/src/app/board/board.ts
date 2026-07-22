import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { MatButton, MatFabButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TasksService } from './tasks';
import { Task, TaskStatus } from './task.model';
import { TaskCard } from './task-card/task-card';
import { TaskFormDialog, TaskFormDialogData } from './task-form-dialog/task-form-dialog';

interface ColumnConfig {
  status: TaskStatus;
  label: string;
}

// Three fixed columns (CONTEXT.md "Stato") — display labels match the English
// column names used throughout the domain glossary and ADR-0002, not translated.
const COLUMNS: ColumnConfig[] = [
  { status: 'ToDo', label: 'To Do' },
  { status: 'Doing', label: 'Doing' },
  { status: 'Done', label: 'Done' },
];

/** How many Done Tasks are shown before "mostra altre" is needed. */
const DONE_PAGE_SIZE = 50;

/** How long a result snackbar stays on screen. */
const SNACK_BAR_DURATION_MS = 3000;

/** The Board: three columns, one per Status, filled from `GET /api/tasks`. Supports creating
 * Tasks via a Material form dialog (F3, ticket #14). */
@Component({
  selector: 'app-board',
  imports: [TaskCard, MatButton, MatFabButton, MatIcon],
  templateUrl: './board.html',
  styleUrl: './board.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Board {
  readonly #tasksService = inject(TasksService);
  readonly #dialog = inject(MatDialog);
  readonly #snackBar = inject(MatSnackBar);

  protected readonly columns = COLUMNS;

  // Plain signal, not toSignal(list()): create() (and later edit/move/delete) calls refresh()
  // to re-fetch, since ADR-0002 ordering is entirely server-side (nothing to reorder locally).
  protected readonly tasks = signal<Task[]>([]);

  // How many Done Tasks are currently visible — "mostra altre" grows it by DONE_PAGE_SIZE.
  protected readonly doneVisibleCount = signal(DONE_PAGE_SIZE);

  /** Loads the Board's Tasks on construction. */
  constructor() {
    this.refresh();
  }

  /**
   * Tasks for one column, in the API's own order (ADR-0002). The Done column additionally
   * caps *which* Tasks are shown to the N most recently created — "al più 50 Attività più
   * recenti con mostra altre" — while still rendering that subset in the API's order: recency
   * picks the subset, ADR-0002 still decides how the subset is arranged on screen.
   */
  protected tasksFor(status: TaskStatus): Task[] {
    const tasksInColumn = this.tasks().filter((task) => task.status === status);
    if (status !== 'Done') return tasksInColumn;

    const mostRecentIds = new Set(
      [...tasksInColumn]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, this.doneVisibleCount())
        .map((task) => task.id),
    );
    return tasksInColumn.filter((task) => mostRecentIds.has(task.id));
  }

  protected hasMoreDone(): boolean {
    return this.tasks().filter((task) => task.status === 'Done').length > this.doneVisibleCount();
  }

  protected showMoreDone(): void {
    this.doneVisibleCount.update((count) => count + DONE_PAGE_SIZE);
  }

  private refresh(): void {
    this.#tasksService.list().subscribe((tasks) => this.tasks.set(tasks));
  }

  /** Opens the create dialog (ticket #14). */
  protected openCreateDialog(): void {
    this.openTaskForm({ mode: 'create' }, 'Attività creata.');
  }

  /** Opens the same form pre-filled for editing (ticket #15). */
  protected openEditDialog(task: Task): void {
    this.openTaskForm({ mode: 'edit', task }, 'Attività aggiornata.');
  }

  private openTaskForm(data: TaskFormDialogData, successMessage: string): void {
    const dialogRef = this.#dialog.open<TaskFormDialog, TaskFormDialogData, boolean>(TaskFormDialog, {
      data,
      width: '480px',
    });

    dialogRef.afterClosed().subscribe((saved) => {
      if (!saved) return;
      this.refresh();
      this.#snackBar.open(successMessage, 'Chiudi', { duration: SNACK_BAR_DURATION_MS });
    });
  }
}
