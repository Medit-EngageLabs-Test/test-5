import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ContactList } from './contact-list';
import { ContactsService } from '../contacts';
import { Contact } from '../contact.model';
import { ALL_APP_ROLES, AppRole, AppRoles } from '../../auth/app-roles.generated';
import { UserStore } from '../../auth/user-store';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';

const mario: Contact = {
  id: 'c-1',
  firstName: 'Mario',
  lastName: 'Rossi',
  email: 'mario@example.com',
  phone: '333 1234567',
  company: 'ACME',
  role: 'CTO',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

async function setup(
  contacts: Contact[] = [mario],
  grantedRoles: readonly AppRole[] = ALL_APP_ROLES,
) {
  const contactsService = {
    list: vi.fn().mockReturnValue(of(contacts)),
    delete: vi.fn().mockReturnValue(of(undefined)),
  };
  const confirmDialog = { confirm: vi.fn().mockResolvedValue(true) };
  const userStore = { hasRole: vi.fn((role: AppRole) => grantedRoles.includes(role)) };

  await TestBed.configureTestingModule({
    imports: [ContactList],
    providers: [
      provideRouter([]),
      { provide: ContactsService, useValue: contactsService },
      { provide: ConfirmDialogService, useValue: confirmDialog },
      { provide: UserStore, useValue: userStore },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ContactList);
  fixture.detectChanges();
  await fixture.whenStable();

  const element = fixture.nativeElement as HTMLElement;
  const rowButton = (label: string) =>
    Array.from(element.querySelectorAll('button, a')).find(
      (el) => el.textContent?.trim() === label,
    ) as HTMLElement | undefined;

  return { fixture, element, contactsService, confirmDialog, rowButton };
}

describe('ContactList', () => {
  it('mostra i contatti in una tabella Material', async () => {
    const { element } = await setup();

    const table = element.querySelector('table[mat-table]');
    expect(table).not.toBeNull();
    expect(table?.textContent).toContain('Mario Rossi');
    expect(table?.textContent).toContain('mario@example.com');
  });

  it('cercando, richiede al servizio la lista filtrata', async () => {
    const { fixture, element, contactsService } = await setup();

    const input = element.querySelector('input') as HTMLInputElement;
    input.value = 'acme';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(contactsService.list).toHaveBeenCalledWith('acme');
  });

  it('senza contatti mostra lo stato vuoto', async () => {
    const { element } = await setup([]);

    expect(element.textContent).toContain('Nessun contatto trovato.');
  });

  it('Elimina, confermato dal dialog, elimina il contatto e ricarica la lista', async () => {
    const { fixture, contactsService, confirmDialog, rowButton } = await setup();
    confirmDialog.confirm.mockResolvedValue(true);
    const initialListCalls = contactsService.list.mock.calls.length;

    rowButton('Elimina')?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(confirmDialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
    expect(contactsService.delete).toHaveBeenCalledWith('c-1');
    expect(contactsService.list.mock.calls.length).toBeGreaterThan(initialListCalls);
  });

  it('Elimina annullato dal dialog non elimina', async () => {
    const { fixture, contactsService, confirmDialog, rowButton } = await setup();
    confirmDialog.confirm.mockResolvedValue(false);

    rowButton('Elimina')?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(contactsService.delete).not.toHaveBeenCalled();
  });

  it('con il solo ruolo Writer nasconde Elimina ma mostra Nuovo contatto e Modifica', async () => {
    const { element, rowButton } = await setup([mario], [AppRoles.ContactsWriter]);

    expect(element.querySelector('a[href="/contacts/new"]')).not.toBeNull();
    expect(rowButton('Modifica')).toBeDefined();
    expect(rowButton('Elimina')).toBeUndefined();
  });

  it('senza ruoli nasconde ogni azione e il nome non è un link', async () => {
    const { element, rowButton } = await setup([mario], []);

    expect(element.querySelector('a[href="/contacts/new"]')).toBeNull();
    expect(rowButton('Modifica')).toBeUndefined();
    expect(rowButton('Elimina')).toBeUndefined();
    expect(element.querySelector('td a[href]')).toBeNull();
    expect(element.textContent).toContain('Mario Rossi');
  });
});
