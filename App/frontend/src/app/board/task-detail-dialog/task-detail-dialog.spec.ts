import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { TaskDetailDialog, TaskDetailDialogData } from './task-detail-dialog';
import { CommentsService } from '../comments';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
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

// c-1 is the caller's own Comment (canEdit/canDelete true); c-2 belongs to someone else and
// carries no permission (ticket #19: author-only edit, author-or-Moderator delete).
const ownComment: Comment = {
  id: 'c-1',
  taskId: 't-1',
  body: 'Primo messaggio',
  authorId: 'u-1',
  authorDisplayName: 'Maria Rossi',
  createdAt: '2026-01-01T10:00:00Z',
  editedAt: null,
  canEdit: true,
  canDelete: true,
};

const othersComment: Comment = {
  id: 'c-2',
  taskId: 't-1',
  body: 'Secondo messaggio',
  authorId: 'u-2',
  authorDisplayName: 'Utente',
  createdAt: '2026-01-01T11:00:00Z',
  editedAt: null,
  canEdit: false,
  canDelete: false,
};

const comments: Comment[] = [ownComment, othersComment];

async function setup(
  data: TaskDetailDialogData,
  overrides: {
    comments?: Comment[];
    commentsServiceOverrides?: Partial<CommentsService>;
    confirmResult?: boolean;
  } = {},
) {
  const dialogRef = { close: vi.fn() };
  const commentsService = {
    list: vi.fn().mockReturnValue(of(overrides.comments ?? comments)),
    create: vi.fn().mockReturnValue(of(ownComment)),
    update: vi.fn().mockReturnValue(of({ ...ownComment, editedAt: '2026-01-02T00:00:00Z' })),
    remove: vi.fn().mockReturnValue(of(undefined)),
    ...overrides.commentsServiceOverrides,
  };
  const confirmDialogService = {
    confirm: vi.fn().mockResolvedValue(overrides.confirmResult ?? true),
  };

  await TestBed.configureTestingModule({
    imports: [TaskDetailDialog],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: dialogRef },
      { provide: CommentsService, useValue: commentsService },
      { provide: ConfirmDialogService, useValue: confirmDialogService },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(TaskDetailDialog);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  const submitForm = () => {
    element
      .querySelector('.send-box')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  const setBody = (value: string) => {
    fixture.componentInstance['form'].controls.body.setValue(value);
    fixture.detectChanges();
  };
  const submitEditForm = () => {
    element
      .querySelector('.comment-edit-form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  return {
    fixture,
    element,
    dialogRef,
    commentsService,
    confirmDialogService,
    submitForm,
    setBody,
    submitEditForm,
    settle,
  };
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
    const { element } = await setup({ task }, { comments: [] });

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
      {
        commentsServiceOverrides: {
          create: vi.fn().mockReturnValue(throwError(() => new Error('boom'))),
        },
      },
    );

    setBody('Un messaggio');
    submitForm();

    expect(element.querySelector('.form-error')).not.toBeNull();
  });

  // ── #19 — Modificare/eliminare messaggi ──────────────────────────────────────

  it('mostra "(modificato)" solo per i messaggi con editedAt valorizzato', async () => {
    const editedComment: Comment = { ...ownComment, editedAt: '2026-01-01T12:00:00Z' };
    const { element } = await setup({ task }, { comments: [editedComment, othersComment] });

    const items = element.querySelectorAll('.comment');
    expect(items[0].textContent).toContain('(modificato)');
    expect(items[1].textContent).not.toContain('(modificato)');
  });

  it('i comandi modifica/elimina sono visibili solo quando canEdit/canDelete sono true', async () => {
    const { element } = await setup({ task });

    const items = element.querySelectorAll('.comment');
    expect(items[0].querySelector('[aria-label="Modifica messaggio"]')).not.toBeNull();
    expect(items[0].querySelector('[aria-label="Elimina messaggio"]')).not.toBeNull();
    expect(items[1].querySelector('[aria-label="Modifica messaggio"]')).toBeNull();
    expect(items[1].querySelector('[aria-label="Elimina messaggio"]')).toBeNull();
  });

  it('modifica: salvare chiama update, ricarica i messaggi ed esce dalla modalità modifica', async () => {
    const { element, fixture, commentsService, submitEditForm } = await setup({ task });

    element.querySelector<HTMLButtonElement>('[aria-label="Modifica messaggio"]')!.click();
    fixture.detectChanges();
    fixture.componentInstance['editForm'].controls.body.setValue('Messaggio corretto');
    fixture.detectChanges();

    submitEditForm();

    expect(commentsService.update).toHaveBeenCalledWith('c-1', { body: 'Messaggio corretto' });
    expect(commentsService.list).toHaveBeenCalledTimes(2); // initial load + refresh after edit
    expect(fixture.componentInstance['editingCommentId']()).toBeNull();
  });

  it('modifica: annullare esce dalla modalità modifica senza chiamare update', async () => {
    const { element, fixture, commentsService } = await setup({ task });

    element.querySelector<HTMLButtonElement>('[aria-label="Modifica messaggio"]')!.click();
    fixture.detectChanges();
    const cancelButton = Array.from(element.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Annulla',
    );
    cancelButton!.click();
    fixture.detectChanges();

    expect(commentsService.update).not.toHaveBeenCalled();
    expect(fixture.componentInstance['editingCommentId']()).toBeNull();
  });

  it('elimina: conferma poi chiama remove e ricarica i messaggi', async () => {
    const { element, commentsService, confirmDialogService, settle } = await setup({ task });

    element.querySelector<HTMLButtonElement>('[aria-label="Elimina messaggio"]')!.click();
    await settle();

    expect(confirmDialogService.confirm).toHaveBeenCalled();
    expect(commentsService.remove).toHaveBeenCalledWith('c-1');
    expect(commentsService.list).toHaveBeenCalledTimes(2); // initial load + refresh after delete
  });

  it('elimina: annullare la conferma non chiama remove', async () => {
    const { element, commentsService, settle } = await setup({ task }, { confirmResult: false });

    element.querySelector<HTMLButtonElement>('[aria-label="Elimina messaggio"]')!.click();
    await settle();

    expect(commentsService.remove).not.toHaveBeenCalled();
  });
});
