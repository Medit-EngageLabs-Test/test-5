import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormField, MatLabel, MatError } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { ContactsService } from '../contacts';
import type { ContactForm as ContactFormData } from '../contact.model';

/** Create/edit form for a single contact; edit mode is entered when the route carries an id. */
@Component({
  selector: 'app-contact-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormField,
    MatLabel,
    MatError,
    MatInput,
    MatButton,
    MatIcon,
  ],
  templateUrl: './contact-form.html',
  styleUrl: './contact-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactForm implements OnInit {
  readonly #contacts = inject(ContactsService);
  readonly #router = inject(Router);
  readonly #route = inject(ActivatedRoute);
  readonly #fb = inject(FormBuilder);

  protected readonly isNew = signal(true);
  protected readonly saving = signal(false);

  protected readonly form = this.#fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: [''],
    phone: [''],
    company: [''],
    role: [''],
  });

  /** In edit mode (an id is present on the route) loads the contact and fills the form. */
  ngOnInit(): void {
    const id = this.#route.snapshot.paramMap.get('id');
    if (id) {
      this.isNew.set(false);
      this.#contacts.get(id).subscribe((contact) => {
        this.form.patchValue(contact);
      });
    }
  }

  protected save(): void {
    if (this.form.invalid) return;
    this.saving.set(true);

    const id = this.#route.snapshot.paramMap.get('id');
    const payload = this.form.getRawValue() as ContactFormData;

    const request$ = id ? this.#contacts.update(id, payload) : this.#contacts.create(payload);

    request$.subscribe({
      next: () => this.#router.navigate(['/contacts']),
      error: () => this.saving.set(false),
    });
  }
}
