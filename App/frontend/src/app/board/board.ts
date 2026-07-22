import { Component, ChangeDetectionStrategy, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { merge } from 'rxjs';
import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { MatButton, MatFabButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TasksService } from './tasks';
import { Task, TaskStatus } from './task.model';
import { TaskCard } from './task-card/task-card';
import { TaskFormDialog, TaskFormDialogData } from './task-form-dialog/task-form-dialog';
import { TaskDetailDialog, TaskDetailDialogData } from './task-detail-dialog/task-detail-dialog';
import { ConfirmDialogService } from '../shared/confirm-dialog/confirm-dialog.service';
import { BoardRealtimeService } from '../realtime/board-realtime';

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

/**
 * The Board: three columns, one per Status, filled from `GET /api/tasks`. Supports creating,
 * editing, moving (drag&drop between columns) and deleting Tasks (F3, tickets #14–#17).
 */
@Component({
  selector: 'app-board',
  imports: [TaskCard, MatButton, MatFabButton, MatIcon, CdkDropListGroup, CdkDropList, CdkDrag],
  templateUrl: './board.html',
  styleUrl: './board.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Test-observability hook only (F6, ticket #23): no visual/behavioral effect. The two-client
  // E2E waits for this before dragging on a client — see quiescent's own doc for why.
  host: { '[attr.data-realtime-quiescent]': 'quiescent()' },
})
export class Board {
  readonly #tasksService = inject(TasksService);
  readonly #dialog = inject(MatDialog);
  readonly #snackBar = inject(MatSnackBar);
  readonly #confirmDialog = inject(ConfirmDialogService);
  readonly #realtime = inject(BoardRealtimeService);

  protected readonly columns = COLUMNS;

  // Plain signal, not toSignal(list()): every create/edit/move/delete calls refresh() to
  // re-fetch, since ADR-0002 ordering is entirely server-side (no local reordering to maintain).
  protected readonly tasks = signal<Task[]>([]);

  // How many Done Tasks are currently visible — "mostra altre" grows it by DONE_PAGE_SIZE.
  protected readonly doneVisibleCount = signal(DONE_PAGE_SIZE);

  // True while a refresh() GET is in flight — combined with the hub's own connected() below into
  // quiescent(), which the `data-realtime-quiescent` host attribute exposes.
  private readonly refreshing = signal(false);

  // True between cdkDragStarted and cdkDragEnded. Not a signal: read only inside refresh()'s
  // apply-site guard and the drag handlers below, never bound to the template — no reactivity
  // needed. See refresh()'s own doc for why this guards the *apply* site, not just the trigger.
  private dragging = false;

  // Set when a refresh() response is discarded because it arrived while dragging — onDragEnded
  // applies it (via one fresh refresh(), not by re-using the discarded response) exactly once.
  private pendingRefresh = false;

  /**
   * True once the hub has connected at least once AND no refresh() is in flight (F6, ticket #23):
   * a two-client E2E dragging on a client while this is false risks the drop landing on stale,
   * about-to-be-replaced bounding boxes — a slow first hub connect firing realigned$'s refresh
   * mid-gesture reshuffles the whole list underneath the pointer, at which point CDK computes the
   * drop against coordinates that no longer match anything, silently no-opping the move instead
   * of erroring. `track task.id` (board.html) already keeps each card's own DOM node/component
   * stable across such a refresh — this is about the *positions* shifting, not nodes being torn.
   */
  protected readonly quiescent = computed(() => this.#realtime.connected() && !this.refreshing());

  /**
   * Loads the Board's Tasks on construction, then keeps it live (F6, ticket #23): every Task
   * event from another client, every Comment/Attachment event (their counts show on the card —
   * ticket #24), and every hub (re)connection (ADR-0001's reconnection realignment) triggers the
   * same refresh() a local mutation already does. commentUpdated$ is deliberately excluded — an
   * edited Comment's body does not change its count.
   */
  constructor() {
    this.refresh();

    merge(
      this.#realtime.taskCreated$,
      this.#realtime.taskUpdated$,
      this.#realtime.taskMoved$,
      this.#realtime.taskDeleted$,
      this.#realtime.commentAdded$,
      this.#realtime.commentDeleted$,
      this.#realtime.attachmentAdded$,
      this.#realtime.attachmentRemoved$,
      this.#realtime.realigned$,
    )
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.refresh());
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

  /**
   * Re-fetches the Board's Tasks. The guard below sits at the *apply* site — inside the GET's
   * own `next` callback — rather than on whatever triggered the refresh: a request already in
   * flight *before* the drag started (e.g. a realtime event that raced a slow hub reconnect,
   * ADR-0001) can still resolve mid-drag, and gating only the trigger would let that response
   * through anyway. Replacing `tasks()` while `dragging` is true would reshuffle the list's
   * positions under the pointer mid-gesture — CDK then computes the drop against bounding boxes
   * that no longer match anything, silently landing the card back where it started instead of
   * erroring (no PATCH, no TaskMoved broadcast, nothing for another client to ever see). The
   * response itself is discarded, not queued for replay: onDragEnded fires one fresh refresh()
   * instead, so the Board never applies data that was already stale by the time the drag ended.
   */
  private refresh(): void {
    this.refreshing.set(true);
    this.#tasksService.list().subscribe({
      next: (tasks) => {
        this.refreshing.set(false);
        if (this.dragging) {
          this.pendingRefresh = true;
          return;
        }
        this.tasks.set(tasks);
      },
      error: () => this.refreshing.set(false),
    });
  }

  /** CDK fires this the instant a drag gesture begins (see refresh()'s own doc). */
  protected onDragStarted(): void {
    this.dragging = true;
  }

  /**
   * CDK fires this once a drag gesture ends, drop or cancel alike. Applies a refresh queued
   * while dragging exactly once, with fresh data rather than the discarded response — the
   * legitimate post-move refresh (onDrop's own updateStatus().subscribe) runs independently,
   * after `dragging` is already false here, so it is never itself swallowed by this guard.
   */
  protected onDragEnded(): void {
    this.dragging = false;
    if (this.pendingRefresh) {
      this.pendingRefresh = false;
      this.refresh();
    }
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
    const dialogRef = this.#dialog.open<TaskFormDialog, TaskFormDialogData, boolean>(
      TaskFormDialog,
      {
        data,
        width: '480px',
      },
    );

    dialogRef.afterClosed().subscribe((saved) => {
      if (!saved) return;
      this.refresh();
      this.#snackBar.open(successMessage, 'Chiudi', { duration: SNACK_BAR_DURATION_MS });
    });
  }

  /**
   * Opens the detail panel (ticket #18): Task description plus its Comments conversation.
   * Refreshes on close — a message written or deleted inside it changes `commentCount`, the
   * card's 💬 badge, even though the card itself sits hidden behind the panel meanwhile.
   */
  protected openDetailDialog(task: Task): void {
    const dialogRef = this.#dialog.open<TaskDetailDialog, TaskDetailDialogData>(TaskDetailDialog, {
      data: { task },
      width: '560px',
    });

    dialogRef.afterClosed().subscribe(() => this.refresh());
  }

  /**
   * Confirms then deletes a Task (ticket #17) — the delete command itself is only ever
   * rendered by TaskCard when `task.canDelete` is true.
   */
  protected async confirmDelete(task: Task): Promise<void> {
    const confirmed = await this.#confirmDialog.confirm({
      title: 'Eliminare questa Attività?',
      message: `«${task.title}» sarà eliminata definitivamente.`,
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!confirmed) return;

    this.#tasksService.remove(task.id).subscribe({
      next: () => {
        this.refresh();
        this.#snackBar.open('Attività eliminata.', 'Chiudi', { duration: SNACK_BAR_DURATION_MS });
      },
      error: () =>
        this.#snackBar.open('Impossibile eliminare l’Attività.', 'Chiudi', {
          duration: SNACK_BAR_DURATION_MS,
        }),
    });
  }

  /**
   * Drag&drop between columns changes Status (ticket #16); ADR-0002 forbids manual intra-column
   * reordering, so a drop back into the same column's list is a deliberate no-op, not an error.
   */
  protected onDrop(event: CdkDragDrop<Task[]>, targetStatus: TaskStatus): void {
    if (event.previousContainer === event.container) return;

    const task = event.item.data as Task;
    this.#tasksService.updateStatus(task.id, targetStatus).subscribe({
      next: () => this.refresh(),
      error: () =>
        this.#snackBar.open('Impossibile spostare l’Attività.', 'Chiudi', {
          duration: SNACK_BAR_DURATION_MS,
        }),
    });
  }
}
