import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { firstValueFrom, Observable } from 'rxjs';
import { authGuard } from './auth-guard';
import { UserStore } from './user-store';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    http: TestBed.inject(HttpTestingController),
    store: TestBed.inject(UserStore),
  };
}

function invokeGuard(url: string): Promise<boolean> {
  const result$ = TestBed.runInInjectionContext(() =>
    authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
  ) as Observable<boolean>;
  return firstValueFrom(result$);
}

describe('authGuard', () => {
  it('lascia passare quando lo store è autenticato', async () => {
    const { http } = setup();

    const result = invokeGuard('/contacts');
    http
      .expectOne('/api/auth/me')
      .flush({ oid: 'u1', displayName: 'Anna', email: null, roles: [] });

    expect(await result).toBe(true);
  });

  it('su sessione non autenticata blocca la navigazione e rimanda al login BFF', async () => {
    const { http, store } = setup();
    const loginSpy = vi.spyOn(store, 'login').mockImplementation(() => undefined);

    const result = invokeGuard('/contacts/new');
    http.expectOne('/api/auth/me').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(await result).toBe(false);
    expect(loginSpy).toHaveBeenCalledWith('/contacts/new');
  });

  it('lascia passare senza login quando la piattaforma auth non è configurata (dev/CI)', async () => {
    const { http, store } = setup();
    const loginSpy = vi.spyOn(store, 'login').mockImplementation(() => undefined);

    const result = invokeGuard('/contacts');
    // OIDC_ISSUER assente: /api/auth/me risponde con lo status 2xx originale della SPA
    // fallback, mai 401 — vedi user-store.spec.ts per il dettaglio del meccanismo.
    http
      .expectOne('/api/auth/me')
      .error(new ProgressEvent('error'), { status: 200, statusText: 'OK' });

    expect(await result).toBe(true);
    expect(loginSpy).not.toHaveBeenCalled();
  });

  it('non richiama /api/auth/me se lo store è già inizializzato', async () => {
    const { http, store } = setup();
    store.loadCurrentUser();
    http.expectOne('/api/auth/me').flush({ oid: 'u1', displayName: null, email: null, roles: [] });

    const result = invokeGuard('/contacts');
    http.expectNone('/api/auth/me');

    expect(await result).toBe(true);
  });
});
