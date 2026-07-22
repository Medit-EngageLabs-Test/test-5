import { Component, ChangeDetectionStrategy, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap, Subject, startWith } from 'rxjs';
import { ContactsService } from '../contacts';
import { Contact } from '../contact.model';
import { AppRoles } from '../../auth/app-roles.generated';
import { UserStore } from '../../auth/user-store';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';

/** Searchable contacts table; the create/edit/delete actions are gated by the user's roles. */
@Component({
  selector: 'app-contact-list',
  imports: [
    RouterLink,
    FormsModule,
    MatTableModule,
    MatFormField,
    MatLabel,
    MatInput,
    MatButton,
    MatIcon,
  ],
  templateUrl: './contact-list.html',
  styleUrl: './contact-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactList {
  readonly #contacts = inject(ContactsService);
  readonly #confirmDialog = inject(ConfirmDialogService);
  readonly #userStore = inject(UserStore);

  protected search = signal('');

  // Mirrors the backend authorization on /api/contacts (see roles.json): Writer and
  // Admin create and edit, only Admin deletes. Always through the generated AppRoles
  // constants — never role-string literals.
  protected readonly canWrite = computed(
    () =>
      this.#userStore.hasRole(AppRoles.ContactsWriter) ||
      this.#userStore.hasRole(AppRoles.ContactsAdmin),
  );
  protected readonly canDelete = computed(() => this.#userStore.hasRole(AppRoles.ContactsAdmin));

  protected readonly columns = ['name', 'email', 'phone', 'company', 'actions'];

  readonly #reload$ = new Subject<void>();

  protected readonly contacts = toSignal(
    this.#reload$.pipe(
      startWith(null),
      switchMap(() => this.#contacts.list(this.search() || undefined)),
    ),
    { initialValue: [] as Contact[] },
  );

  protected onSearch(value: string): void {
    this.search.set(value);
    this.#reload$.next();
  }

  protected async deleteContact(contact: Contact): Promise<void> {
    const confirmed = await this.#confirmDialog.confirm({
      title: 'Eliminare il contatto?',
      message: `«${this.fullName(contact)}» sarà rimosso dalla rubrica. L’operazione è irreversibile.`,
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!confirmed) return;
    this.#contacts.delete(contact.id).subscribe(() => {
      this.#reload$.next();
    });
  }

  protected fullName(c: Contact): string {
    return `${c.firstName} ${c.lastName}`;
  }
}
