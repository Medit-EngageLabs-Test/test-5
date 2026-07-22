import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { TaskDetailDialog, TaskDetailDialogData } from './task-detail-dialog';
import { CommentsService } from '../comments';
import { Comment } from '../comment.model';
import { Task } from '../task.model';

const task: Task = {
  id: 't-1',
  title: 'Attività con conversazione',
  description: 'Una descrizione',
  status: 'ToDo',
  urgency: 'Medium',
  dueDate: null,
  createdById: 'u-1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  canDelete: true,
  commentCount: 2,
};

const comments: Comment[] = [
  {
    id: 'c-1',
    taskId: 't-1',
    body: 'Primo messaggio',
    authorId: 'u-1',
    authorDisplayName: 'Maria Rossi',
    createdAt: '2026-01-01T10:00:00Z',
    editedAt: null,
  },
  {
    id: 'c-2',
    taskId: 't-1',
    body: 'Secondo messaggio',
    authorId: 'u-2',
    authorDisplayName: 'Utente',
    createdAt: '2026-01-01T11:00:00Z',
    editedAt: null,
  },
];

async function setup(
  data: TaskDetailDialogData,
  commentsServiceOverrides: Partial<CommentsService> = {},
) {
  const dialogRef = { close: vi.fn() };
  const commentsService = {
    list: vi.fn().mockReturnValue(of(comments)),
    create: vi.fn().mockReturnValue(of(comments[0])),
    ...commentsServiceOverrides,
  };

  await TestBed.configureTestingModule({
    imports: [TaskDetailDialog],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: dialogRef },
      { provide: CommentsService, useValue: commentsService },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(TaskDetailDialog);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  const submitForm = () => {
    element
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  const setBody = (value: string) => {
    fixture.componentInstance['form'].controls.body.setValue(value);
    fixture.detectChanges();
  };

  return { fixture, element, dialogRef, commentsService, submitForm, setBody };
}

describe('TaskDetailDialog', () => {
  it('mostra titolo e descrizione della Attività', async () => {
    const { element } = await setup({ task });

    expect(element.textContent).toContain('Attività con conversazione');
    expect(element.textContent).toContain('Una descrizione');
  });

  it('carica e mostra i messaggi con autore e data (ticket #18)', async () => {
    const { element, commentsService } = await setup({ task });

    expect(commentsService.list).toHaveBeenCalledWith('t-1');
    const items = element.querySelectorAll('.comment');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Primo messaggio');
    expect(items[0].textContent).toContain('Maria Rossi');
    expect(items[1].textContent).toContain('Secondo messaggio');
    expect(items[1].textContent).toContain('Utente');
  });

  it('senza messaggi mostra lo stato vuoto', async () => {
    const { element } = await setup({ task }, { list: vi.fn().mockReturnValue(of([])) });

    expect(element.textContent).toContain('Nessun messaggio ancora');
  });

  it('corpo vuoto: il submit non chiama create', async () => {
    const { submitForm, commentsService } = await setup({ task });

    submitForm();

    expect(commentsService.create).not.toHaveBeenCalled();
  });

  it('invio valido: chiama create, ricarica i messaggi e svuota il campo', async () => {
    const { submitForm, setBody, commentsService, fixture } = await setup({ task });

    setBody('Un nuovo messaggio');
    submitForm();

    expect(commentsService.create).toHaveBeenCalledWith('t-1', { body: 'Un nuovo messaggio' });
    expect(commentsService.list).toHaveBeenCalledTimes(2); // initial load + refresh after send
    expect(fixture.componentInstance['form'].controls.body.value).toBe('');
  });

  it('errore del server: mostra un messaggio di errore', async () => {
    const { submitForm, setBody, element } = await setup(
      { task },
      { create: vi.fn().mockReturnValue(throwError(() => new Error('boom'))) },
    );

    setBody('Un messaggio');
    submitForm();

    expect(element.querySelector('.form-error')).not.toBeNull();
  });
});
