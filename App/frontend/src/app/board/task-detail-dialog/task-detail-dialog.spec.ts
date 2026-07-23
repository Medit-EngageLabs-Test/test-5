import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError, Subject } from 'rxjs';
import { TaskDetailDialog, TaskDetailDialogData } from './task-detail-dialog';
import { CommentsService } from '../comments';
import { AttachmentsService } from '../attachments';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { Comment } from '../comment.model';
import { Task } from '../task.model';
import {
  BoardRealtimeService,
  AttachmentRealtimeEvent,
  CommentRealtimeEvent,
} from '../../realtime/board-realtime';

/**
 * A fake BoardRealtimeService (F6): every stream is its own Subject a test can push into,
 * instead of the real service's hub connection attempting a network call in a unit test.
 */
function makeFakeRealtimeService() {
  return {
    taskCreated$: new Subject<{ taskId: string }>(),
    taskUpdated$: new Subject<{ taskId: string }>(),
    taskMoved$: new Subject<{ taskId: string }>(),
    taskDeleted$: new Subject<{ taskId: string }>(),
    commentAdded$: new Subject<CommentRealtimeEvent>(),
    commentUpdated$: new Subject<CommentRealtimeEvent>(),
    commentDeleted$: new Subject<CommentRealtimeEvent>(),
    attachmentAdded$: new Subject<AttachmentRealtimeEvent>(),
    attachmentRemoved$: new Subject<AttachmentRealtimeEvent>(),
    realigned$: new Subject<void>(),
  };
}

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
  attachmentCount: 0,
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
    attachmentsServiceOverrides?: Partial<AttachmentsService>;
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
  const attachmentsService = {
    list: vi.fn().mockReturnValue(of([])),
    uploadToTask: vi.fn(),
    uploadToComment: vi.fn(),
    downloadUrl: vi.fn((id: string) => `/api/attachments/${id}/content`),
    remove: vi.fn().mockReturnValue(of(undefined)),
    ...overrides.attachmentsServiceOverrides,
  };
  const confirmDialogService = {
    confirm: vi.fn().mockResolvedValue(overrides.confirmResult ?? true),
  };
  const realtimeService = makeFakeRealtimeService();

  await TestBed.configureTestingModule({
    imports: [TaskDetailDialog],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: dialogRef },
      { provide: CommentsService, useValue: commentsService },
      { provide: AttachmentsService, useValue: attachmentsService },
      { provide: ConfirmDialogService, useValue: confirmDialogService },
      { provide: BoardRealtimeService, useValue: realtimeService },
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
    attachmentsService,
    confirmDialogService,
    realtimeService,
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

  // ── #20 — Allegati sulla Attività ────────────────────────────────────────────

  it('carica la lista Allegati della Attività (ticket #20)', async () => {
    const attachment = {
      id: 'a-1',
      taskId: 't-1',
      commentId: null,
      fileName: 'nota.txt',
      contentType: 'text/plain',
      sizeBytes: 2048,
      uploadedById: 'u-1',
      createdAt: '2026-01-01T00:00:00Z',
      canDelete: true,
    };
    const { element, attachmentsService } = await setup(
      { task },
      { attachmentsServiceOverrides: { list: vi.fn().mockReturnValue(of([attachment])) } },
    );

    expect(attachmentsService.list).toHaveBeenCalledWith('t-1');
    expect(element.textContent).toContain('nota.txt');
    expect(element.textContent).toContain('2.0 KB');
  });

  it('senza allegati mostra lo stato vuoto', async () => {
    const { element } = await setup({ task });

    expect(element.querySelector('.attachments-section')?.textContent).toContain(
      'Nessun allegato.',
    );
  });

  it('caricare un file chiama uploadToTask e ricarica gli allegati', async () => {
    const uploadedAttachment = {
      id: 'a-2',
      taskId: 't-1',
      commentId: null,
      fileName: 'immagine.png',
      contentType: 'image/png',
      sizeBytes: 512,
      uploadedById: 'u-1',
      createdAt: '2026-01-01T00:00:00Z',
      canDelete: true,
    };
    const { fixture, attachmentsService } = await setup(
      { task },
      {
        attachmentsServiceOverrides: {
          uploadToTask: vi.fn().mockReturnValue(of(uploadedAttachment)),
        },
      },
    );
    const file = new File(['contenuto'], 'immagine.png', { type: 'image/png' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file] });

    fixture.componentInstance['onTaskFileSelected']({ target: input } as unknown as Event, input);

    expect(attachmentsService.uploadToTask).toHaveBeenCalledWith('t-1', file);
    expect(attachmentsService.list).toHaveBeenCalledTimes(2); // initial load + refresh after upload
  });

  // ── #21 — Allegati sui messaggi ──────────────────────────────────────────────

  it('mostra gli allegati di un messaggio sotto al suo testo (ticket #21)', async () => {
    const commentAttachment = {
      id: 'a-3',
      taskId: 't-1',
      commentId: 'c-1',
      fileName: 'sul-messaggio.txt',
      contentType: 'text/plain',
      sizeBytes: 100,
      uploadedById: 'u-1',
      createdAt: '2026-01-01T00:00:00Z',
      canDelete: true,
    };
    const { element } = await setup(
      { task },
      { attachmentsServiceOverrides: { list: vi.fn().mockReturnValue(of([commentAttachment])) } },
    );

    const items = element.querySelectorAll('.comment');
    expect(items[0].textContent).toContain('sul-messaggio.txt');
    expect(items[1].textContent).not.toContain('sul-messaggio.txt');
  });

  it('caricare un file su un messaggio chiama uploadToComment e ricarica gli allegati', async () => {
    const uploadedAttachment = {
      id: 'a-4',
      taskId: 't-1',
      commentId: 'c-1',
      fileName: 'allegato.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      uploadedById: 'u-1',
      createdAt: '2026-01-01T00:00:00Z',
      canDelete: true,
    };
    const { fixture, attachmentsService } = await setup(
      { task },
      {
        attachmentsServiceOverrides: {
          uploadToComment: vi.fn().mockReturnValue(of(uploadedAttachment)),
        },
      },
    );
    const file = new File(['contenuto'], 'allegato.pdf', { type: 'application/pdf' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file] });

    fixture.componentInstance['onCommentFileSelected'](
      { target: input } as unknown as Event,
      ownComment,
      input,
    );

    expect(attachmentsService.uploadToComment).toHaveBeenCalledWith('c-1', file);
    expect(attachmentsService.list).toHaveBeenCalledTimes(2); // initial load + refresh after upload
  });

  // ── #22 — Rimuovere allegati ─────────────────────────────────────────────────

  it('il comando rimuovi allegato è visibile solo quando canDelete è true (ticket #22)', async () => {
    const own = {
      id: 'a-5',
      taskId: 't-1',
      commentId: null,
      fileName: 'mio.txt',
      contentType: 'text/plain',
      sizeBytes: 10,
      uploadedById: 'u-1',
      createdAt: '2026-01-01T00:00:00Z',
      canDelete: true,
    };
    const notMine = { ...own, id: 'a-6', fileName: 'altrui.txt', canDelete: false };
    const { element } = await setup(
      { task },
      { attachmentsServiceOverrides: { list: vi.fn().mockReturnValue(of([own, notMine])) } },
    );

    const items = Array.from(element.querySelectorAll('.attachments-section .attachment'));
    const ownItem = items.find((item) => item.textContent?.includes('mio.txt'));
    const notMineItem = items.find((item) => item.textContent?.includes('altrui.txt'));
    expect(ownItem?.querySelector('[aria-label="Elimina allegato"]')).not.toBeNull();
    expect(notMineItem?.querySelector('[aria-label="Elimina allegato"]')).toBeNull();
  });

  it('rimuovi allegato: conferma poi chiama remove e ricarica gli allegati', async () => {
    const attachment = {
      id: 'a-7',
      taskId: 't-1',
      commentId: null,
      fileName: 'da-rimuovere.txt',
      contentType: 'text/plain',
      sizeBytes: 10,
      uploadedById: 'u-1',
      createdAt: '2026-01-01T00:00:00Z',
      canDelete: true,
    };
    const { element, attachmentsService, confirmDialogService, settle } = await setup(
      { task },
      { attachmentsServiceOverrides: { list: vi.fn().mockReturnValue(of([attachment])) } },
    );

    element.querySelector<HTMLButtonElement>('[aria-label="Elimina allegato"]')!.click();
    await settle();

    expect(confirmDialogService.confirm).toHaveBeenCalled();
    expect(attachmentsService.remove).toHaveBeenCalledWith('a-7');
    expect(attachmentsService.list).toHaveBeenCalledTimes(2); // initial load + refresh after delete
  });

  it('rimuovi allegato: annullare la conferma non chiama remove', async () => {
    const attachment = {
      id: 'a-8',
      taskId: 't-1',
      commentId: null,
      fileName: 'non-rimosso.txt',
      contentType: 'text/plain',
      sizeBytes: 10,
      uploadedById: 'u-1',
      createdAt: '2026-01-01T00:00:00Z',
      canDelete: true,
    };
    const { element, attachmentsService, settle } = await setup(
      { task },
      {
        attachmentsServiceOverrides: { list: vi.fn().mockReturnValue(of([attachment])) },
        confirmResult: false,
      },
    );

    element.querySelector<HTMLButtonElement>('[aria-label="Elimina allegato"]')!.click();
    await settle();

    expect(attachmentsService.remove).not.toHaveBeenCalled();
  });

  // ── F6 — Aggiornamenti in tempo reale (ticket #24) ─────────────────────────────

  it('un evento commentAdded$ per questa Attività ricarica la conversazione', async () => {
    const { commentsService, realtimeService, settle } = await setup({ task });
    expect(commentsService.list).toHaveBeenCalledTimes(1);

    realtimeService.commentAdded$.next({ taskId: task.id, commentId: 'c-9' });
    await settle();

    expect(commentsService.list).toHaveBeenCalledTimes(2);
  });

  it('un evento commentAdded$ per un’altra Attività NON ricarica questo pannello', async () => {
    const { commentsService, realtimeService, settle } = await setup({ task });
    expect(commentsService.list).toHaveBeenCalledTimes(1);

    realtimeService.commentAdded$.next({ taskId: 'another-task', commentId: 'c-9' });
    await settle();

    expect(commentsService.list).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['commentUpdated$', { taskId: task.id, commentId: 'c-1' }] as const,
    ['commentDeleted$', { taskId: task.id, commentId: 'c-1' }] as const,
    ['attachmentAdded$', { taskId: task.id, attachmentId: 'a-1' }] as const,
    ['attachmentRemoved$', { taskId: task.id, attachmentId: 'a-1' }] as const,
  ])(
    'un evento %s per questa Attività ricarica conversazione e allegati',
    async (stream, payload) => {
      const { commentsService, attachmentsService, realtimeService, settle } = await setup({
        task,
      });
      expect(commentsService.list).toHaveBeenCalledTimes(1);
      expect(attachmentsService.list).toHaveBeenCalledTimes(1);

      (
        realtimeService[stream as keyof typeof realtimeService] as {
          next: (value: unknown) => void;
        }
      ).next(payload);
      await settle();

      expect(commentsService.list).toHaveBeenCalledTimes(2);
      expect(attachmentsService.list).toHaveBeenCalledTimes(2);
    },
  );

  it('un evento realigned$ (riconnessione hub) ricarica il pannello', async () => {
    const { commentsService, realtimeService, settle } = await setup({ task });
    expect(commentsService.list).toHaveBeenCalledTimes(1);

    realtimeService.realigned$.next();
    await settle();

    expect(commentsService.list).toHaveBeenCalledTimes(2);
  });
});
