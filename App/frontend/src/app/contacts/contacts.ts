import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Contact, ContactForm } from './contact.model';

/** HTTP client for the `/api/contacts` resource. */
@Injectable({ providedIn: 'root' })
export class ContactsService {
  readonly #http = inject(HttpClient);
  readonly #base = '/api/contacts';

  /** Lists contacts, optionally filtered by a free-text search term. */
  list(search?: string): Observable<Contact[]> {
    const params = search ? new HttpParams().set('q', search) : undefined;
    return this.#http.get<Contact[]>(this.#base, { params });
  }

  /** Fetches a single contact by id. */
  get(id: string): Observable<Contact> {
    return this.#http.get<Contact>(`${this.#base}/${id}`);
  }

  /** Creates a new contact from the form payload. */
  create(form: ContactForm): Observable<Contact> {
    return this.#http.post<Contact>(this.#base, form);
  }

  /** Updates the contact with the given id from the form payload. */
  update(id: string, form: ContactForm): Observable<Contact> {
    return this.#http.put<Contact>(`${this.#base}/${id}`, form);
  }

  /** Deletes the contact with the given id. */
  delete(id: string): Observable<void> {
    return this.#http.delete<void>(`${this.#base}/${id}`);
  }
}
