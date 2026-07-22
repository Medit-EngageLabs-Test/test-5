import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ConfirmDialog, ConfirmDialogData } from './confirm-dialog';

/**
 * Apre il dialog di conferma condiviso e restituisce la scelta dell'utente
 * come Promise, così gli store possono usarlo al posto di confirm().
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly dialog = inject(MatDialog);

  /**
   * Mostra il dialog e attende la scelta.
   * @param options Titolo, messaggio e variante del dialog.
   * @returns true solo alla conferma esplicita; false su annulla, Esc o click fuori.
   */
  async confirm(options: ConfirmDialogData): Promise<boolean> {
    const dialogRef = this.dialog.open(ConfirmDialog, { data: options });
    return ((await firstValueFrom(dialogRef.afterClosed())) as boolean | undefined) ?? false;
  }
}
