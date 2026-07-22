import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButton } from '@angular/material/button';
import { TasksService } from './tasks';
import { Task, TaskStatus } from './task.model';
import { TaskCard } from './task-card/task-card';

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

/** The read-only Board: three columns, one per Status, filled from `GET /api/tasks`. */
@Component({
  selector: 'app-board',
  imports: [TaskCard, MatButton],
  templateUrl: './board.html',
  styleUrl: './board.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Board {
  readonly #tasksService = inject(TasksService);

  protected readonly columns = COLUMNS;
  protected readonly tasks = toSignal(this.#tasksService.list(), { initialValue: [] as Task[] });

  // How many Done Tasks are currently visible — "mostra altre" grows it by DONE_PAGE_SIZE.
  protected readonly doneVisibleCount = signal(DONE_PAGE_SIZE);

  /**
   * Tasks for one column, in the API's own order (ADR-0002). The Done column additionally
   * caps how many are shown — "al più 50 Attività più recenti con mostra altre".
   */
  protected tasksFor(status: TaskStatus): Task[] {
    const tasksInColumn = this.tasks().filter((task) => task.status === status);
    return status === 'Done' ? tasksInColumn.slice(0, this.doneVisibleCount()) : tasksInColumn;
  }

  protected hasMoreDone(): boolean {
    return this.tasks().filter((task) => task.status === 'Done').length > this.doneVisibleCount();
  }

  protected showMoreDone(): void {
    this.doneVisibleCount.update((count) => count + DONE_PAGE_SIZE);
  }
}
