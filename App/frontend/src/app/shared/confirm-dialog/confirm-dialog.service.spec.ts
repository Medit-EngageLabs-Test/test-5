import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MATERIAL_ANIMATIONS } from '@angular/material/core';
import { describe, it, expect, afterEach } from 'vitest';
import { ConfirmDialogService } from './confirm-dialog.service';

async function setup() {
  await TestBed.configureTestingModule({
    providers: [{ provide: MATERIAL_ANIMATIONS, useValue: { animationsDisabled: true } }],
  }).compileComponents();

  const service = TestBed.inject(ConfirmDialogService);

  const open = (options = { title: 'Eliminare?', message: 'Irreversibile.' }) => {
    const result = service.confirm(options);
    TestBed.inject(ApplicationRef).tick();
    return result;
  };

  return { service, open };
}

function clickInOverlay(selector: string) {
  document.querySelector<HTMLButtonElement>(selector)?.click();
}

describe('ConfirmDialogService', () => {
  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((el) => el.remove());
  });

  it('risolve true quando l’utente conferma', async () => {
    const { open } = await setup();

    const result = open();
    clickInOverlay('.confirm-dialog-confirm');

    expect(await result).toBe(true);
  });

  it('risolve false quando l’utente annulla', async () => {
    const { open } = await setup();

    const result = open();
    clickInOverlay('.confirm-dialog-cancel');

    expect(await result).toBe(false);
  });

  it('risolve false se il dialog viene congedato senza una scelta', async () => {
    const { open } = await setup();

    const result = open();
    TestBed.inject(MatDialog).closeAll();

    expect(await result).toBe(false);
  });
});
