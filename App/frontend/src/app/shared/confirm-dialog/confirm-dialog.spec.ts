import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmDialog, ConfirmDialogData } from './confirm-dialog';

async function setup(data: ConfirmDialogData) {
  const dialogRef = { close: vi.fn() };
  await TestBed.configureTestingModule({
    imports: [ConfirmDialog],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: dialogRef },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ConfirmDialog);
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    dialogRef,
    title: element.querySelector('[mat-dialog-title]'),
    message: element.querySelector('mat-dialog-content'),
    confirmButton: element.querySelector<HTMLButtonElement>('.confirm-dialog-confirm'),
    cancelButton: element.querySelector<HTMLButtonElement>('.confirm-dialog-cancel'),
  };
}

describe('ConfirmDialog', () => {
  it('mostra titolo e messaggio ricevuti', async () => {
    const { title, message } = await setup({
      title: 'Eliminare?',
      message: 'Non si torna indietro.',
    });

    expect(title?.textContent).toContain('Eliminare?');
    expect(message?.textContent).toContain('Non si torna indietro.');
  });

  it('conferma chiudendo il dialog con true', async () => {
    const { confirmButton, dialogRef } = await setup({ title: 'Stop', message: 'Fermare?' });

    confirmButton?.click();

    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('annulla chiudendo il dialog con false', async () => {
    const { cancelButton, dialogRef } = await setup({ title: 'Stop', message: 'Fermare?' });

    cancelButton?.click();

    expect(dialogRef.close).toHaveBeenCalledWith(false);
  });

  it('usa l’etichetta di conferma personalizzata e la variante danger', async () => {
    const { confirmButton } = await setup({
      title: 'Eliminare?',
      message: 'Irreversibile.',
      confirmLabel: 'Elimina',
      danger: true,
    });

    expect(confirmButton?.textContent?.trim()).toBe('Elimina');
    expect(confirmButton?.classList).toContain('danger');
  });
});
