import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { Board } from './board';
import { TasksService } from './tasks';
import { Task, TaskStatus } from './task.model';

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
    ...overrides,
  };
}

async function setup(tasks: Task[]) {
  const tasksService = { list: vi.fn().mockReturnValue(of(tasks)) };

  await TestBed.configureTestingModule({
    imports: [Board],
    providers: [{ provide: TasksService, useValue: tasksService }],
  }).compileComponents();

  const fixture = TestBed.createComponent(Board);
  fixture.detectChanges();
  await fixture.whenStable();

  const element = fixture.nativeElement as HTMLElement;
  const column = (label: string) =>
    element.querySelector(`.board-column[aria-label="${label}"]`) as HTMLElement;

  return { fixture, element, column };
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
});
