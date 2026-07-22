import { TestBed } from '@angular/core/testing';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { of, Subject } from 'rxjs';
import { Board } from './board';
import { TasksService } from './tasks';
import { Task, TaskStatus } from './task.model';
import { BoardRealtimeService, TaskRealtimeEvent } from '../realtime/board-realtime';

/**
 * A fake BoardRealtimeService (F6): every stream is its own Subject a test can push into,
 * instead of the real service's hub connection attempting a network call in a unit test.
 */
function makeFakeRealtimeService() {
  return {
    taskCreated$: new Subject<TaskRealtimeEvent>(),
    taskUpdated$: new Subject<TaskRealtimeEvent>(),
    taskMoved$: new Subject<TaskRealtimeEvent>(),
    taskDeleted$: new Subject<TaskRealtimeEvent>(),
    realigned$: new Subject<void>(),
  };
}

/**
 * Reaches Board's protected onDrop() — bracket notation is TypeScript's documented escape
 * hatch for private/protected members, the same pattern task-form-dialog.spec.ts uses for `form`.
 */
function callOnDrop(
  fixture: { componentInstance: Board },
  event: CdkDragDrop<Task[]>,
  status: TaskStatus,
): void {
  (
    fixture.componentInstance as unknown as {
      onDrop: (e: CdkDragDrop<Task[]>, s: TaskStatus) => void;
    }
  ).onDrop(event, status);
}

function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: `Task ${overrides.id}`,
    description: null,
    status: 'ToDo',
    urgency: 'Medium',
    dueDate: null,
    createdById: 'u-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    canDelete: true,
    commentCount: 0,
    attachmentCount: 0,
    ...overrides,
  };
}

async function setup(tasks: Task[], tasksServiceOverrides: Record<string, unknown> = {}) {
  const tasksService = { list: vi.fn().mockReturnValue(of(tasks)), ...tasksServiceOverrides };
  const realtimeService = makeFakeRealtimeService();

  await TestBed.configureTestingModule({
    imports: [Board],
    providers: [
      { provide: TasksService, useValue: tasksService },
      { provide: BoardRealtimeService, useValue: realtimeService },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(Board);
  fixture.detectChanges();
  await fixture.whenStable();

  const element = fixture.nativeElement as HTMLElement;
  const column = (label: string) =>
    element.querySelector(`.board-column[aria-label="${label}"]`) as HTMLElement;

  return { fixture, element, column, tasksService, realtimeService };
}

describe('Board', () => {
  it('mostra le tre colonne To Do, Doing e Done', async () => {
    const { element } = await setup([]);

    expect(element.textContent).toContain('To Do');
    expect(element.textContent).toContain('Doing');
    expect(element.textContent).toContain('Done');
  });

  it('senza Attività ogni colonna mostra lo stato vuoto', async () => {
    const { column } = await setup([]);

    expect(column('To Do').textContent).toContain('Nessuna Attività qui.');
    expect(column('Doing').textContent).toContain('Nessuna Attività qui.');
    expect(column('Done').textContent).toContain('Nessuna Attività qui.');
  });

  it('mette ogni Attività nella colonna del suo Status', async () => {
    const tasks = [
      makeTask({ id: '1', status: 'ToDo', title: 'In ToDo' }),
      makeTask({ id: '2', status: 'Doing', title: 'In Doing' }),
      makeTask({ id: '3', status: 'Done', title: 'In Done' }),
    ];

    const { column } = await setup(tasks);

    expect(column('To Do').textContent).toContain('In ToDo');
    expect(column('To Do').textContent).not.toContain('In Doing');
    expect(column('Doing').textContent).toContain('In Doing');
    expect(column('Done').textContent).toContain('In Done');
  });

  it("rispetta l'ordine restituito dall'API dentro ogni colonna", async () => {
    const tasks = [
      makeTask({ id: '1', status: 'ToDo', title: 'Prima' }),
      makeTask({ id: '2', status: 'ToDo', title: 'Seconda' }),
    ];

    const { column } = await setup(tasks);

    const titles = Array.from(column('To Do').querySelectorAll('.task-title')).map(
      (el) => el.textContent,
    );
    expect(titles).toEqual(['Prima', 'Seconda']);
  });

  it("nella colonna Done mostra al più 50 Attività, con 'Mostra altre' per le successive", async () => {
    const status: TaskStatus = 'Done';
    const tasks = Array.from({ length: 55 }, (_, i) => makeTask({ id: `d-${i}`, status }));

    const { fixture, column } = await setup(tasks);

    expect(column('Done').querySelectorAll('app-task-card').length).toBe(50);
    const showMoreButton = Array.from(column('Done').querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Mostra altre',
    );
    expect(showMoreButton).toBeDefined();

    showMoreButton?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(column('Done').querySelectorAll('app-task-card').length).toBe(55);
  });

  it('nella colonna Done sceglie le Attività più recenti, oltre le prime 50', async () => {
    // 51 Done Tasks, each older than the last (index 0 = oldest); with a cap of 50 the single
    // oldest one ("Vecchissima") must be the one left out, not whichever the API happened
    // to list first.
    const status: TaskStatus = 'Done';
    const tasks = [
      makeTask({ id: 'oldest', status, title: 'Vecchissima', createdAt: '2020-01-01T00:00:00Z' }),
      ...Array.from({ length: 50 }, (_, i) =>
        makeTask({ id: `recent-${i}`, status, createdAt: `2026-0${1 + (i % 9)}-01T00:00:00Z` }),
      ),
    ];

    const { column } = await setup(tasks);

    expect(column('Done').textContent).not.toContain('Vecchissima');
    expect(column('Done').querySelectorAll('app-task-card').length).toBe(50);
  });

  // ── #16 — Spostare tra colonne: drop abilitato solo tra colonne (ADR-0002) ─────

  it('il drop tra colonne diverse chiama updateStatus con il nuovo Status', async () => {
    const task = makeTask({ id: '1', status: 'ToDo' });
    const updateStatus = vi.fn().mockReturnValue(of({ ...task, status: 'Doing' }));
    const { fixture, tasksService } = await setup([task], { updateStatus });

    callOnDrop(
      fixture,
      {
        previousContainer: { id: 'todo-list' },
        container: { id: 'doing-list' },
        item: { data: task },
      } as unknown as CdkDragDrop<Task[]>,
      'Doing',
    );

    expect(updateStatus).toHaveBeenCalledWith('1', 'Doing');
    expect(tasksService.list).toHaveBeenCalledTimes(2); // initial load + refresh() after the move
  });

  it('il drop nella stessa colonna non chiama updateStatus — nessun riordino intra-colonna', async () => {
    const task = makeTask({ id: '1', status: 'ToDo' });
    const updateStatus = vi.fn();
    const { fixture } = await setup([task], { updateStatus });

    const sameList = { id: 'todo-list' };
    callOnDrop(
      fixture,
      {
        previousContainer: sameList,
        container: sameList,
        item: { data: task },
      } as unknown as CdkDragDrop<Task[]>,
      'ToDo',
    );

    expect(updateStatus).not.toHaveBeenCalled();
  });

  // ── F6 — Aggiornamenti in tempo reale (ticket #23) ─────────────────────────────

  it('un evento taskCreated$ da un altro client ricarica la board', async () => {
    const { tasksService, realtimeService } = await setup([]);
    expect(tasksService.list).toHaveBeenCalledTimes(1); // initial load only

    realtimeService.taskCreated$.next({ taskId: 'from-another-client' });

    expect(tasksService.list).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['taskUpdated$', { taskId: 't-1' }] as const,
    ['taskMoved$', { taskId: 't-1' }] as const,
    ['taskDeleted$', { taskId: 't-1' }] as const,
    ['realigned$', undefined] as const,
  ])('un evento %s ricarica la board', async (stream, payload) => {
    const { tasksService, realtimeService } = await setup([]);
    expect(tasksService.list).toHaveBeenCalledTimes(1);

    (
      realtimeService[stream as keyof typeof realtimeService] as { next: (value: unknown) => void }
    ).next(payload);

    expect(tasksService.list).toHaveBeenCalledTimes(2);
  });
});
