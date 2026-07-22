import { Component, inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
  MatDialogClose,
} from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';

/**
 * Dati di apertura del dialog di conferma.
 */
export interface ConfirmDialogData {
  /** Titolo del dialog. */
  title: string;
  /** Domanda o avviso mostrato all'utente. */
  message: string;
  /** Etichetta del bottone di conferma (default: «Conferma»). */
  confirmLabel?: string;
  /** Se true il bottone di conferma usa i token error (azioni distruttive). */
  danger?: boolean;
}

/**
 * Dialog di conferma Material condiviso: sostituisce i confirm() nativi.
 * Chiude con true alla conferma, false all'annullamento; Esc e il click
 * fuori dal dialog equivalgono ad annullare (gestiti da MatDialog).
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose, MatButton],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.scss',
})
export class ConfirmDialog {
  /** Contenuti e variante del dialog, forniti da chi lo apre. */
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
