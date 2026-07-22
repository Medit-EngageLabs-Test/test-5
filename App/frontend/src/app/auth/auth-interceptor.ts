import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { UserStore } from './user-store';

function isInternalApiRequest(url: string): boolean {
  return url.startsWith('/api/');
}

/**
 * Su 401 la sessione è scaduta: azzera lo store e rimanda al login BFF con la route
 * corrente come returnUrl. Legge l'URL da window.location, non da router.url: a un
 * refresh a freddo su una route protetta il 401 di /api/auth/me (dal guard) può
 * scattare prima che il Router abbia committato la navigazione.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!isInternalApiRequest(request.url)) {
    return next(request);
  }

  const store = inject(UserStore);

  return next(request.clone({ withCredentials: true })).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        store.reset();
        store.login(window.location.pathname + window.location.search);
      }
      return throwError(() => error);
    }),
  );
};
