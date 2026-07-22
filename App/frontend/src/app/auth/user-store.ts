import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { AppRole } from './app-roles.generated';
import { CurrentUser } from './current-user.model';

const anonymousUser: CurrentUser = { oid: null, displayName: null, email: null, roles: [] };

/**
 * Holds the signed-in user and exposes role checks to the UI. Populated once from the BFF's
 * `GET /api/auth/me`; when the auth platform is off (no OIDC contract — local development/CI)
 * it reports full access, mirroring the backend's then-open endpoints.
 */
@Injectable({ providedIn: 'root' })
export class UserStore {
  readonly #http = inject(HttpClient);

  readonly #user = signal<CurrentUser>(anonymousUser);
  readonly #initialized = signal(false);
  // Platform not configured (no OIDC_ISSUER — local development/CI only, see
  // .intelliflow/portal-contracts/core.md): GET /api/auth/me is not mapped and the request
  // falls through to the SPA's index.html. Angular fails to parse that body as JSON and
  // still yields an HttpErrorResponse, but with the original 2xx status — never a 401.
  // Only a real 401 means "no session, login required".
  readonly #authRequired = signal(true);

  readonly oid = computed(() => this.#user().oid);
  readonly displayName = computed(() => this.#user().displayName);
  readonly email = computed(() => this.#user().email);
  readonly roles = computed(() => this.#user().roles);
  readonly isAuthenticated = computed(() => this.#user().oid !== null);
  readonly initialized = this.#initialized.asReadonly();

  /** Label to display for the user: displayName, with email as fallback. */
  readonly label = computed(() => this.displayName() ?? this.email());

  /** When false, navigation must not be gated behind login: the auth platform is off. */
  readonly canAccess = computed(() => this.isAuthenticated() || !this.#authRequired());

  /**
   * True when the signed-in user carries the role — always referenced through the generated
   * AppRoles constants, never role-string literals. With the auth platform off (no OIDC
   * contract — local development/CI) there is no identity to authorize: the backend leaves
   * its endpoints open and the UI mirrors that with full access.
   */
  hasRole(role: AppRole): boolean {
    return !this.#authRequired() || this.#user().roles.includes(role);
  }

  /** No-op when already initialized: reset() re-enables it after an expired session. */
  loadCurrentUser(): void {
    if (this.#initialized()) return;

    this.#http
      .get<CurrentUser>('/api/auth/me')
      .pipe(
        catchError((error: unknown) => {
          this.#authRequired.set(error instanceof HttpErrorResponse && error.status === 401);
          return of(anonymousUser);
        }),
      )
      .subscribe((user) => {
        this.#user.set(user);
        this.#initialized.set(true);
      });
  }

  /** Clears the cached user so the next loadCurrentUser() re-fetches — used after an expired session. */
  reset(): void {
    this.#user.set(anonymousUser);
    this.#initialized.set(false);
  }

  /**
   * Navigates the browser to the BFF login: not an Angular route but an endpoint that
   * triggers the OIDC redirect to the identity provider, so a real navigation is needed.
   */
  login(returnUrl?: string): void {
    const query = returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : '';
    window.location.href = `/api/auth/login${query}`;
  }

  /**
   * A real form POST, not HttpClient: sign-out goes through the IdP logout, a
   * cross-origin redirect that a fetch/XHR cannot make the browser navigate.
   */
  logout(): void {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/api/auth/logout';
    document.body.appendChild(form);
    form.submit();
  }
}
