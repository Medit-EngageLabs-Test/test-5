import { TestBed } from '@angular/core/testing';
import { TaskCard } from './task-card';
import { Task } from '../task.model';

const baseTask: Task = {
  id: 't-1',
  title: 'Scrivere i test',
  description: null,
  status: 'ToDo',
  urgency: 'High',
  dueDate: null,
  createdById: 'u-1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  canDelete: true,
};

async function setup(task: Task) {
  await TestBed.configureTestingModule({ imports: [TaskCard] }).compileComponents();

  const fixture = TestBed.createComponent(TaskCard);
  fixture.componentRef.setInput('task', task);
  fixture.detectChanges();
  await fixture.whenStable();

  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('TaskCard', () => {
  it('mostra titolo e badge urgenza', async () => {
    const { element } = await setup(baseTask);

    expect(element.textContent).toContain('Scrivere i test');
    expect(element.querySelector('.urgency-badge')?.textContent?.trim()).toBe('Alta');
    expect(element.querySelector('.urgency-high')).not.toBeNull();
  });

  it('senza scadenza non mostra la data', async () => {
    const { element } = await setup(baseTask);

    expect(element.querySelector('.due-date')).toBeNull();
  });

  it('con scadenza passata e Status non Done evidenzia la scadenza come scaduta', async () => {
    const { element } = await setup({ ...baseTask, dueDate: '2020-01-01', status: 'ToDo' });

    expect(element.querySelector('.due-date.overdue')).not.toBeNull();
  });

  it('con scadenza passata ma Status Done non evidenzia la scadenza come scaduta', async () => {
    const { element } = await setup({ ...baseTask, dueDate: '2020-01-01', status: 'Done' });

    expect(element.querySelector('.due-date')).not.toBeNull();
    expect(element.querySelector('.due-date.overdue')).toBeNull();
  });

  it('con scadenza futura non evidenzia la scadenza come scaduta', async () => {
    const { element } = await setup({ ...baseTask, dueDate: '2099-01-01' });

    expect(element.querySelector('.due-date.overdue')).toBeNull();
  });

  it('mostra i contatori commenti/allegati a zero (F1)', async () => {
    const { element } = await setup(baseTask);

    expect(element.querySelector('[aria-label="Commenti"]')?.textContent).toContain('0');
    expect(element.querySelector('[aria-label="Allegati"]')?.textContent).toContain('0');
  });

  it('il comando modifica è sempre visibile ed emette editRequested', async () => {
    const { fixture, element } = await setup(baseTask);
    const editEmitted = vi.fn();
    fixture.componentInstance.editRequested.subscribe(editEmitted);

    const editButton = element.querySelector<HTMLButtonElement>('[aria-label="Modifica Attività"]');
    expect(editButton).not.toBeNull();
    editButton!.click();

    expect(editEmitted).toHaveBeenCalledTimes(1);
  });
});
