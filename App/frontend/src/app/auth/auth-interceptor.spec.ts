import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './auth-interceptor';
import { UserStore } from './user-store';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
  });
  return {
    http: TestBed.inject(HttpClient),
    controller: TestBed.inject(HttpTestingController),
    store: TestBed.inject(UserStore),
  };
}

describe('authInterceptor', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('aggiunge withCredentials alle richieste verso le API interne', () => {
    const { http, controller } = setup();

    http.get('/api/contacts').subscribe();
    const request = controller.expectOne('/api/contacts');

    expect(request.request.withCredentials).toBe(true);
    request.flush([]);
  });

  it('non aggiunge withCredentials alle richieste esterne', () => {
    const { http, controller } = setup();

    http.get('https://example.com/data').subscribe();
    const request = controller.expectOne('https://example.com/data');

    expect(request.request.withCredentials).toBe(false);
    request.flush({});
  });

  it('su 401 dalle API interne azzera lo store e rimanda al login BFF con la route corrente', () => {
    window.history.replaceState(null, '', '/contacts/42/edit');
    const { http, controller, store } = setup();
    const loginSpy = vi.spyOn(store, 'login').mockImplementation(() => undefined);
    const receivedErrors: unknown[] = [];

    http.get('/api/contacts/42').subscribe({ error: (error) => receivedErrors.push(error) });
    controller
      .expectOne('/api/contacts/42')
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(loginSpy).toHaveBeenCalledWith('/contacts/42/edit');
    expect(store.initialized()).toBe(false);
    expect(receivedErrors).toHaveLength(1);
  });

  it('su 403 non rimanda al login e propaga l’errore al chiamante', () => {
    const { http, controller, store } = setup();
    const loginSpy = vi.spyOn(store, 'login').mockImplementation(() => undefined);
    const receivedErrors: unknown[] = [];

    http.get('/api/contacts/42').subscribe({ error: (error) => receivedErrors.push(error) });
    controller.expectOne('/api/contacts/42').flush(null, { status: 403, statusText: 'Forbidden' });

    expect(loginSpy).not.toHaveBeenCalled();
    expect(receivedErrors).toHaveLength(1);
  });
});
