import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { UserStore } from './auth/user-store';

async function setup() {
  await TestBed.configureTestingModule({
    imports: [App],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  }).compileComponents();

  const fixture = TestBed.createComponent(App);
  fixture.detectChanges();
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    http: TestBed.inject(HttpTestingController),
    store: TestBed.inject(UserStore),
  };
}

describe('App', () => {
  it('si crea correttamente', async () => {
    const { fixture } = await setup();
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('mostra la toolbar Material col nome dell’app', async () => {
    const { element } = await setup();
    const toolbar = element.querySelector('mat-toolbar');
    expect(toolbar).not.toBeNull();
    expect(toolbar?.textContent).toContain('Rubrica Aziendale');
  });

  it('rende il router outlet per le pagine', async () => {
    const { element } = await setup();
    expect(element.querySelector('router-outlet')).not.toBeNull();
  });

  it('da anonimo non mostra nome utente né pulsante di logout', async () => {
    const { fixture, element, http, store } = await setup();
    store.loadCurrentUser();
    http.expectOne('/api/auth/me').flush(null, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(element.querySelector('.toolbar-user')).toBeNull();
    expect(element.querySelector('button[aria-label="Esci"]')).toBeNull();
  });

  it('da autenticato mostra displayName e pulsante di logout', async () => {
    const { fixture, element, http, store } = await setup();
    store.loadCurrentUser();
    http.expectOne('/api/auth/me').flush({
      oid: 'u1',
      displayName: 'Anna Verdi',
      email: 'anna@example.com',
      roles: [],
    });
    fixture.detectChanges();

    expect(element.querySelector('.toolbar-user')?.textContent).toContain('Anna Verdi');
    expect(element.querySelector('button[aria-label="Esci"]')).not.toBeNull();
  });

  it('da autenticato senza displayName mostra l’email come fallback', async () => {
    const { fixture, element, http, store } = await setup();
    store.loadCurrentUser();
    http.expectOne('/api/auth/me').flush({
      oid: 'u1',
      displayName: null,
      email: 'anna@example.com',
      roles: [],
    });
    fixture.detectChanges();

    expect(element.querySelector('.toolbar-user')?.textContent).toContain('anna@example.com');
  });

  it('cliccando logout invoca user.logout()', async () => {
    const { fixture, element, http, store } = await setup();
    store.loadCurrentUser();
    http.expectOne('/api/auth/me').flush({
      oid: 'u1',
      displayName: 'Anna Verdi',
      email: null,
      roles: [],
    });
    fixture.detectChanges();

    const logoutSpy = vi.spyOn(store, 'logout').mockImplementation(() => undefined);
    (element.querySelector('button[aria-label="Esci"]') as HTMLButtonElement).click();

    expect(logoutSpy).toHaveBeenCalledOnce();
  });
});
