import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { TaskFormDialog, TaskFormDialogData } from './task-form-dialog';
import { TasksService } from '../tasks';
import { Task } from '../task.model';

const existingTask: Task = {
  id: 't-1',
  title: 'Titolo esistente',
  description: 'Descrizione esistente',
  status: 'Doing',
  urgency: 'High',
  dueDate: '2026-03-01',
  createdById: 'u-1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  canDelete: true,
};

async function setup(data: TaskFormDialogData, tasksServiceOverrides: Partial<TasksService> = {}) {
  const dialogRef = { close: vi.fn() };
  const tasksService = {
    create: vi.fn().mockReturnValue(of(existingTask)),
    update: vi.fn().mockReturnValue(of(existingTask)),
    ...tasksServiceOverrides,
  };

  await TestBed.configureTestingModule({
    imports: [TaskFormDialog],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: dialogRef },
      { provide: TasksService, useValue: tasksService },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(TaskFormDialog);
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  const submitForm = () => {
    element
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  const setTitle = (value: string) => {
    fixture.componentInstance['form'].controls.title.setValue(value);
    fixture.detectChanges();
  };

  return { fixture, element, dialogRef, tasksService, submitForm, setTitle };
}

describe('TaskFormDialog', () => {
  it('in modalità creazione parte con i campi vuoti e Urgenza Media', async () => {
    const { fixture } = await setup({ mode: 'create' });

    const form = fixture.componentInstance['form'];
    expect(form.controls.title.value).toBe('');
    expect(form.controls.urgency.value).toBe('Medium');
  });

  it('in modalità modifica precompila i campi dell’Attività esistente', async () => {
    const { fixture } = await setup({ mode: 'edit', task: existingTask });

    const form = fixture.componentInstance['form'];
    expect(form.controls.title.value).toBe(existingTask.title);
    expect(form.controls.description.value).toBe(existingTask.description);
    expect(form.controls.urgency.value).toBe(existingTask.urgency);
    expect(form.controls.dueDate.value).toBe(existingTask.dueDate);
  });

  it('titolo obbligatorio: submit con titolo vuoto o spazi non chiama create e mostra l’errore', async () => {
    const { element, submitForm, tasksService, setTitle } = await setup({ mode: 'create' });

    setTitle('   ');
    submitForm();

    expect(tasksService.create).not.toHaveBeenCalled();
    expect(element.querySelector('mat-error')?.textContent).toContain('obbligatorio');
  });

  it('creazione valida: chiama create e chiude il dialog con true', async () => {
    const { submitForm, tasksService, setTitle, dialogRef } = await setup({ mode: 'create' });

    setTitle('Nuova Attività');
    submitForm();

    expect(tasksService.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Nuova Attività', urgency: 'Medium' }),
    );
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('modifica valida: chiama update con l’id dell’Attività e chiude il dialog con true', async () => {
    const { submitForm, tasksService, dialogRef } = await setup({
      mode: 'edit',
      task: existingTask,
    });

    submitForm();

    expect(tasksService.update).toHaveBeenCalledWith(
      existingTask.id,
      expect.objectContaining({
        title: existingTask.title,
      }),
    );
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('errore del server: non chiude il dialog e mostra un messaggio', async () => {
    const { element, submitForm, setTitle, dialogRef } = await setup(
      { mode: 'create' },
      { create: vi.fn().mockReturnValue(throwError(() => new Error('boom'))) },
    );

    setTitle('Attività');
    submitForm();

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(element.querySelector('.form-error')).not.toBeNull();
  });
});
