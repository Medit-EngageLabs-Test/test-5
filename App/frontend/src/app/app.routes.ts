import { Routes } from '@angular/router';
import { authGuard } from './auth/auth-guard';

export const routes: Routes = [
  {
    path: '',
    // Guarda tutte le route in un solo punto: una nuova route qui eredita la protezione
    // senza doversene ricordare, invece di ripetere canActivate su ognuna.
    canActivateChild: [authGuard],
    children: [
      { path: '', redirectTo: 'contacts', pathMatch: 'full' },
      {
        path: 'contacts',
        loadComponent: () =>
          import('./contacts/contact-list/contact-list').then((m) => m.ContactList),
      },
      {
        path: 'contacts/new',
        loadComponent: () =>
          import('./contacts/contact-form/contact-form').then((m) => m.ContactForm),
      },
      {
        path: 'contacts/:id/edit',
        loadComponent: () =>
          import('./contacts/contact-form/contact-form').then((m) => m.ContactForm),
      },
    ],
  },
];
