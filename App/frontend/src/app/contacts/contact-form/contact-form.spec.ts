import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ContactForm } from './contact-form';
import { ContactsService } from '../contacts';
import { Contact } from '../contact.model';

const mario: Contact = {
  id: 'c-1',
  firstName: 'Mario',
  lastName: 'Rossi',
  email: 'mario@example.com',
  phone: null,
  company: null,
  role: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

async function setup(routeId: string | null = null) {
  const contactsService = {
    get: vi.fn().mockReturnValue(of(mario)),
    create: vi.fn().mockReturnValue(of(mario)),
    update: vi.fn().mockReturnValue(of(mario)),
  };

  await TestBed.configureTestingModule({
    imports: [ContactForm],
    providers: [
      provideRouter([]),
      { provide: ContactsService, useValue: contactsService },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => routeId } } } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(ContactForm);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const element = fixture.nativeElement as HTMLElement;
  const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate');

  const fill = (id: string, value: string) => {
    const input = element.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  const submit = async () => {
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  return { fixture, element, contactsService, navigateSpy, fill, submit };
}

describe('ContactForm', () => {
  it('mostra i campi in mat-form-field con l’intestazione «Nuovo contatto»', async () => {
    const { element } = await setup();

    expect(element.querySelector('h1')?.textContent).toContain('Nuovo contatto');
    expect(element.querySelectorAll('mat-form-field').length).toBe(6);
    expect(element.querySelector('#firstName')).not.toBeNull();
  });

  it('col submit a campi obbligatori vuoti mostra gli errori e non salva', async () => {
    const { element, contactsService, navigateSpy, submit } = await setup();

    await submit();

    const errors = Array.from(element.querySelectorAll('mat-error')).map((el) =>
      el.textContent?.trim(),
    );
    expect(errors).toContain('Il nome è obbligatorio');
    expect(errors).toContain('Il cognome è obbligatorio');
    expect(contactsService.create).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('salva un nuovo contatto e torna alla lista', async () => {
    const { contactsService, navigateSpy, fill, submit } = await setup();

    fill('firstName', 'Anna');
    fill('lastName', 'Verdi');
    await submit();

    expect(contactsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Anna', lastName: 'Verdi' }),
    );
    expect(navigateSpy).toHaveBeenCalledWith(['/contacts']);
  });

  it('in modifica carica il contatto, mostra «Modifica contatto» e salva con update', async () => {
    const { element, contactsService, navigateSpy, fill, submit } = await setup('c-1');

    expect(element.querySelector('h1')?.textContent).toContain('Modifica contatto');
    expect(element.querySelector<HTMLInputElement>('#firstName')?.value).toBe('Mario');

    fill('lastName', 'Bianchi');
    await submit();

    expect(contactsService.update).toHaveBeenCalledWith(
      'c-1',
      expect.objectContaining({ lastName: 'Bianchi' }),
    );
    expect(navigateSpy).toHaveBeenCalledWith(['/contacts']);
  });
});
