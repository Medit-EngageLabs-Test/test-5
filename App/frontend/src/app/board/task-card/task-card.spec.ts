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
  commentCount: 0,
  attachmentCount: 0,
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

  it('mostra il contatore Allegati dal task (ticket #20)', async () => {
    const { element } = await setup({ ...baseTask, attachmentCount: 2 });

    expect(element.querySelector('[aria-label="Allegati"]')?.textContent).toContain('2');
  });

  it('mostra il contatore Commenti dal task (ticket #18)', async () => {
    const { element } = await setup({ ...baseTask, commentCount: 3 });

    expect(element.querySelector('[aria-label="Commenti"]')?.textContent).toContain('3');
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

  it('il comando elimina è visibile quando canDelete è true ed emette deleteRequested', async () => {
    const { fixture, element } = await setup({ ...baseTask, canDelete: true });
    const deleteEmitted = vi.fn();
    fixture.componentInstance.deleteRequested.subscribe(deleteEmitted);

    const deleteButton = element.querySelector<HTMLButtonElement>(
      '[aria-label="Elimina Attività"]',
    );
    expect(deleteButton).not.toBeNull();
    deleteButton!.click();

    expect(deleteEmitted).toHaveBeenCalledTimes(1);
  });

  it('il comando elimina è nascosto quando canDelete è false (ticket #17)', async () => {
    const { element } = await setup({ ...baseTask, canDelete: false });

    expect(element.querySelector('[aria-label="Elimina Attività"]')).toBeNull();
  });

  it('il click sulla card emette detailsRequested (ticket #18)', async () => {
    const { fixture, element } = await setup(baseTask);
    const detailsEmitted = vi.fn();
    fixture.componentInstance.detailsRequested.subscribe(detailsEmitted);

    element.querySelector<HTMLElement>('.task-card')!.click();

    expect(detailsEmitted).toHaveBeenCalledTimes(1);
  });

  it('il comando "Apri dettaglio Attività" è la via accessibile da tastiera ed emette detailsRequested una sola volta (ticket #18)', async () => {
    const { fixture, element } = await setup(baseTask);
    const detailsEmitted = vi.fn();
    fixture.componentInstance.detailsRequested.subscribe(detailsEmitted);

    const detailsButton = element.querySelector<HTMLButtonElement>(
      '[aria-label="Apri dettaglio Attività"]',
    );
    expect(detailsButton).not.toBeNull();
    detailsButton!.click();

    // stopPropagation on the button prevents the card's own (click) from also firing.
    expect(detailsEmitted).toHaveBeenCalledTimes(1);
  });

  it('il click sul comando modifica non emette anche detailsRequested', async () => {
    const { fixture, element } = await setup(baseTask);
    const detailsEmitted = vi.fn();
    fixture.componentInstance.detailsRequested.subscribe(detailsEmitted);

    element.querySelector<HTMLButtonElement>('[aria-label="Modifica Attività"]')!.click();

    expect(detailsEmitted).not.toHaveBeenCalled();
  });
});
