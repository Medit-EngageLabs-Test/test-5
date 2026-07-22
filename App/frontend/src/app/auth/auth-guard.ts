import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';
import { UserStore } from './user-store';

export const authGuard: CanActivateFn = (_route, state) => {
  const store = inject(UserStore);

  store.loadCurrentUser();

  return toObservable(store.initialized).pipe(
    filter(Boolean),
    take(1),
    map(() => {
      if (store.canAccess()) return true;
      store.login(state.url);
      return false;
    }),
  );
};
