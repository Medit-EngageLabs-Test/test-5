import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ContactsService } from './contacts';
import { Contact, ContactForm } from './contact.model';

const anna: Contact = {
  id: 'c-9',
  firstName: 'Anna',
  lastName: 'Verdi',
  email: null,
  phone: null,
  company: null,
  role: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const annaForm: ContactForm = {
  firstName: 'Anna',
  lastName: 'Verdi',
  email: null,
  phone: null,
  company: null,
  role: null,
};

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(ContactsService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('ContactsService', () => {
  it('lista i contatti e passa la ricerca come parametro q', () => {
    const { service, http } = setup();
    let received: Contact[] | undefined;

    service.list().subscribe((contacts) => (received = contacts));
    http.expectOne('/api/contacts').flush([anna]);
    expect(received).toEqual([anna]);

    service.list('acme').subscribe();
    const filtered = http.expectOne('/api/contacts?q=acme');
    expect(filtered.request.method).toBe('GET');
    filtered.flush([]);

    http.verify();
  });

  it('recupera un contatto per id', () => {
    const { service, http } = setup();
    let received: Contact | undefined;

    service.get('c-9').subscribe((contact) => (received = contact));
    http.expectOne('/api/contacts/c-9').flush(anna);

    expect(received).toEqual(anna);
    http.verify();
  });

  it('crea, aggiorna ed elimina passando dal verbo HTTP corretto', () => {
    const { service, http } = setup();

    service.create(annaForm).subscribe();
    const post = http.expectOne('/api/contacts');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual(annaForm);
    post.flush(anna);

    service.update('c-9', annaForm).subscribe();
    const put = http.expectOne('/api/contacts/c-9');
    expect(put.request.method).toBe('PUT');
    put.flush(anna);

    service.delete('c-9').subscribe();
    const del = http.expectOne('/api/contacts/c-9');
    expect(del.request.method).toBe('DELETE');
    del.flush(null);

    http.verify();
  });
});
