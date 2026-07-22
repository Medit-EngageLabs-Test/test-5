import { Routes } from '@angular/router';
import { authGuard } from './auth/auth-guard';

export const routes: Routes = [
  {
    path: '',
    // Guarda tutte le route in un solo punto: una nuova route qui eredita la protezione
    // senza doversene ricordare, invece di ripetere canActivate su ognuna.
    canActivateChild: [authGuard],
    children: [
      { path: '', redirectTo: 'board', pathMatch: 'full' },
      {
        path: 'board',
        loadComponent: () => import('./board/board').then((m) => m.Board),
      },
    ],
  },
];
