import { test, expect, type Page } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createContact(
  page: Page,
  opts: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    company?: string;
    role?: string;
  },
) {
  await page.goto('/contacts/new');
  await page.locator('#firstName').fill(opts.firstName);
  await page.locator('#lastName').fill(opts.lastName);
  if (opts.email) await page.locator('#email').fill(opts.email);
  if (opts.phone) await page.locator('#phone').fill(opts.phone);
  if (opts.company) await page.locator('#company').fill(opts.company);
  if (opts.role) await page.locator('#role').fill(opts.role);
  await page.getByRole('button', { name: 'Salva' }).click();
  // After save the app redirects to the contacts list
  await expect(page).toHaveURL('/contacts');
}

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe('Rubrica Aziendale', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // The default route redirects to /contacts
    await expect(page).toHaveURL('/contacts');
  });

  // ── List view ──────────────────────────────────────────────────────────────

  test('shows the contacts page with header and search bar', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Rubrica' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Nuovo contatto' })).toBeVisible();
    await expect(page.getByPlaceholder('Cerca per nome, email o azienda…')).toBeVisible();
  });

  // ── Create ─────────────────────────────────────────────────────────────────

  test('creates a new contact and shows it in the list', async ({ page }) => {
    const firstName = `Test${Date.now()}`;
    const lastName = 'Playwright';

    await createContact(page, {
      firstName,
      lastName,
      email: 'pw@test.local',
      company: 'Playwright Corp',
    });

    await expect(page.getByRole('cell', { name: `${firstName} ${lastName}` })).toBeVisible();
  });

  test('shows validation errors when required fields are empty', async ({ page }) => {
    await page.goto('/contacts/new');
    // Touch both required fields without filling them
    await page.locator('#firstName').click();
    await page.locator('#lastName').click();
    await page.locator('#firstName').click(); // re-focus to trigger touched state
    await page.getByRole('button', { name: 'Salva' }).click();

    await expect(page.getByText('Il nome è obbligatorio')).toBeVisible();
    await expect(page.getByText('Il cognome è obbligatorio')).toBeVisible();
    // URL must NOT change — form stays open
    await expect(page).toHaveURL('/contacts/new');
  });

  // ── Edit ───────────────────────────────────────────────────────────────────

  test('edits an existing contact', async ({ page }) => {
    const firstName = `Edit${Date.now()}`;
    await createContact(page, { firstName, lastName: 'Before' });

    // Click the "Modifica" button for that contact
    const row = page.getByRole('row', { name: new RegExp(`${firstName}`) });
    await row.getByRole('link', { name: 'Modifica' }).click();

    await expect(page).toHaveURL(/\/contacts\/.+\/edit/);
    await expect(page.getByRole('heading', { name: 'Modifica contatto' })).toBeVisible();

    // Wait for the form to be populated by the GET /api/contacts/{id} response
    await expect(page.locator('#firstName')).toHaveValue(firstName);

    // Update the last name
    const lastNameInput = page.locator('#lastName');
    await lastNameInput.clear();
    await lastNameInput.fill('After');
    await page.getByRole('button', { name: 'Salva' }).click();

    await expect(page).toHaveURL('/contacts');
    await expect(page.getByRole('cell', { name: `${firstName} After` })).toBeVisible();
  });

  // ── Search ─────────────────────────────────────────────────────────────────

  test('filters contacts by search term', async ({ page }) => {
    const unique = `Unique${Date.now()}`;
    await createContact(page, { firstName: unique, lastName: 'Search', company: 'FindMe Corp' });

    const searchInput = page.getByPlaceholder('Cerca per nome, email o azienda…');
    await searchInput.fill(unique);

    // Only the matching row should be visible
    await expect(page.getByRole('cell', { name: `${unique} Search` })).toBeVisible();

    // A clearly different search term should produce the empty state
    await searchInput.fill('ZZZ_nomatch_ZZZ');
    await expect(page.getByText('Nessun contatto trovato.')).toBeVisible();
  });

  // ── Delete ─────────────────────────────────────────────────────────────────

  test('deletes a contact after confirming in the Material dialog', async ({ page }) => {
    const firstName = `Del${Date.now()}`;
    await createContact(page, { firstName, lastName: 'ToDelete' });

    const row = page.getByRole('row', { name: new RegExp(`${firstName}`) });

    // Click "Elimina" — opens the confirm dialog
    await row.getByRole('button', { name: 'Elimina' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Eliminare il contatto?')).toBeVisible();

    // Confirm with the dialog's "Elimina"
    await dialog.getByRole('button', { name: 'Elimina' }).click();

    // Row must disappear
    await expect(page.getByRole('cell', { name: `${firstName} ToDelete` })).not.toBeVisible();
  });

  test('cancels the delete dialog without deleting', async ({ page }) => {
    const firstName = `Keep${Date.now()}`;
    await createContact(page, { firstName, lastName: 'Alive' });

    const row = page.getByRole('row', { name: new RegExp(`${firstName}`) });
    await row.getByRole('button', { name: 'Elimina' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Eliminare il contatto?')).toBeVisible();

    // Cancel
    await dialog.getByRole('button', { name: 'Annulla' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Contact is still there
    await expect(page.getByRole('cell', { name: `${firstName} Alive` })).toBeVisible();
  });

  // ── Navigation ─────────────────────────────────────────────────────────────

  test('"Torna alla lista" navigates back from the form', async ({ page }) => {
    await page.goto('/contacts/new');
    await page.getByRole('link', { name: 'Torna alla lista' }).click();
    await expect(page).toHaveURL('/contacts');
  });

  test('"Annulla" navigates back from the form without saving', async ({ page }) => {
    await page.goto('/contacts/new');
    await page.locator('#firstName').fill('Unsaved');
    await page.getByRole('link', { name: 'Annulla' }).click();
    await expect(page).toHaveURL('/contacts');
    // The unsaved entry must not appear
    await expect(page.getByRole('cell', { name: 'Unsaved' })).not.toBeVisible();
  });

  // ── Health check ───────────────────────────────────────────────────────────

  test('backend /health returns healthy', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toMatchObject({ status: 'healthy' });
  });
});
