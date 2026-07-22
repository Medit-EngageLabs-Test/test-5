import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AppRoles } from './app-roles.generated';
import { UserStore } from './user-store';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    store: TestBed.inject(UserStore),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('UserStore', () => {
  it('carica oid, displayName, email e roles da /api/auth/me', () => {
    const { store, http } = setup();

    store.loadCurrentUser();
    http.expectOne('/api/auth/me').flush({
      oid: 'u1',
      displayName: 'Anna Verdi',
      email: 'anna@example.com',
      roles: ['Editor'],
    });

    expect(store.oid()).toBe('u1');
    expect(store.displayName()).toBe('Anna Verdi');
    expect(store.email()).toBe('anna@example.com');
    expect(store.roles()).toEqual(['Editor']);
    expect(store.isAuthenticated()).toBe(true);
    expect(store.initialized()).toBe(true);

    http.verify();
  });

  it('su 401 resta non autenticato, initialized, e blocca canAccess()', () => {
    const { store, http } = setup();

    store.loadCurrentUser();
    http.expectOne('/api/auth/me').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(store.oid()).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
    expect(store.initialized()).toBe(true);
    expect(store.canAccess()).toBe(false);

    http.verify();
  });

  it('su errore diverso da 401 (piattaforma auth non configurata) canAccess() resta true', () => {
    const { store, http } = setup();

    store.loadCurrentUser();
    // OIDC_ISSUER assente (sviluppo locale/CI): /api/auth/me non è mappato, la richiesta
    // ricade sulla SPA e Angular restituisce un HttpErrorResponse con lo status 2xx originale
    // (mai 401) perché il body non è JSON valido.
    http
      .expectOne('/api/auth/me')
      .error(new ProgressEvent('error'), { status: 200, statusText: 'OK' });

    expect(store.isAuthenticated()).toBe(false);
    expect(store.canAccess()).toBe(true);

    http.verify();
  });

  it('non richiama /api/auth/me una seconda volta se già inizializzato', () => {
    const { store, http } = setup();

    store.loadCurrentUser();
    http.expectOne('/api/auth/me').flush({ oid: 'u1', displayName: null, email: null, roles: [] });

    store.loadCurrentUser();
    http.expectNone('/api/auth/me');

    http.verify();
  });

  it('hasRole() risponde in base ai ruoli (costanti generate) dell’utente autenticato', () => {
    const { store, http } = setup();

    store.loadCurrentUser();
    http
      .expectOne('/api/auth/me')
      .flush({ oid: 'u1', displayName: null, email: null, roles: [AppRoles.ContactsWriter] });

    expect(store.hasRole(AppRoles.ContactsWriter)).toBe(true);
    expect(store.hasRole(AppRoles.ContactsAdmin)).toBe(false);

    http.verify();
  });

  it('con piattaforma auth disattivata hasRole() concede ogni ruolo (rispecchia il backend aperto)', () => {
    const { store, http } = setup();

    store.loadCurrentUser();
    http
      .expectOne('/api/auth/me')
      .error(new ProgressEvent('error'), { status: 200, statusText: 'OK' });

    expect(store.hasRole(AppRoles.ContactsAdmin)).toBe(true);
    expect(store.hasRole(AppRoles.ContactsWriter)).toBe(true);

    http.verify();
  });

  it('label() usa displayName, con email come fallback', () => {
    const { store, http } = setup();

    store.loadCurrentUser();
    http
      .expectOne('/api/auth/me')
      .flush({ oid: 'u1', displayName: null, email: 'anna@example.com', roles: [] });

    expect(store.label()).toBe('anna@example.com');

    http.verify();
  });

  it('reset() azzera lo stato e riabilita loadCurrentUser()', () => {
    const { store, http } = setup();

    store.loadCurrentUser();
    http.expectOne('/api/auth/me').flush({ oid: 'u1', displayName: null, email: null, roles: [] });
    expect(store.isAuthenticated()).toBe(true);

    store.reset();
    expect(store.isAuthenticated()).toBe(false);
    expect(store.initialized()).toBe(false);

    store.loadCurrentUser();
    http.expectOne('/api/auth/me').flush(null, { status: 401, statusText: 'Unauthorized' });

    http.verify();
  });
});
