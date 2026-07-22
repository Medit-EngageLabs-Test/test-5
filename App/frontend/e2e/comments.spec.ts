import { test, expect, Page } from '@playwright/test';

/** A short but unique title so each test locates only the card it created (see tasks.spec.ts). */
function uniqueTitle(label: string): string {
  return `E2E ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createTask(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: 'Nuova Attività' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Titolo').fill(title);
  await page.getByRole('button', { name: 'Crea' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

function cardByTitle(page: Page, title: string) {
  return page.locator('.task-card-drag', { hasText: title });
}

async function openDetailPanel(page: Page, title: string): Promise<void> {
  await cardByTitle(page, title).locator('.task-card').click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('Conversazione sulle Attività (F4, ticket #18)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/board');
  });

  test('aprire una card mostra il pannello di dettaglio', async ({ page }) => {
    const title = uniqueTitle('dettaglio');
    await createTask(page, title);

    await openDetailPanel(page, title);

    await expect(page.getByRole('dialog').getByText(title)).toBeVisible();
    await expect(page.getByText('Nessun messaggio ancora')).toBeVisible();
  });

  test('scrivere un messaggio lo fa comparire nella conversazione', async ({ page }) => {
    const title = uniqueTitle('scrivi');
    const message = uniqueTitle('messaggio');
    await createTask(page, title);
    await openDetailPanel(page, title);

    await page.getByLabel('Scrivi un messaggio').fill(message);
    await page.getByRole('button', { name: 'Invia' }).click();

    await expect(page.getByRole('dialog').getByText(message)).toBeVisible();
  });

  test('il contatore 💬 sulla card si aggiorna dopo aver scritto un messaggio', async ({ page }) => {
    const title = uniqueTitle('contatore');
    await createTask(page, title);
    const card = cardByTitle(page, title);
    await expect(card.getByLabel('Commenti')).toContainText('0');

    await openDetailPanel(page, title);
    await page.getByLabel('Scrivi un messaggio').fill(uniqueTitle('msg'));
    await page.getByRole('button', { name: 'Invia' }).click();
    await expect(page.getByRole('dialog').getByText('Nessun messaggio ancora')).toHaveCount(0);
    // Scoped to the dialog: the Board's own "Attività creata." snackbar (createTask() above)
    // may still be on screen with its own "Chiudi" dismiss action at this point.
    await page.getByRole('dialog').getByRole('button', { name: 'Chiudi' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await expect(card.getByLabel('Commenti')).toContainText('1');
  });

  // ── #19 — Modificare/eliminare messaggi (dal proprio autore) ────────────────

  test('modificare un messaggio ne aggiorna il testo e mostra "(modificato)"', async ({ page }) => {
    const title = uniqueTitle('modifica-msg');
    const originalMessage = uniqueTitle('originale');
    const updatedMessage = uniqueTitle('aggiornato');
    await createTask(page, title);
    await openDetailPanel(page, title);
    await page.getByLabel('Scrivi un messaggio').fill(originalMessage);
    await page.getByRole('button', { name: 'Invia' }).click();
    await expect(page.getByRole('dialog').getByText(originalMessage)).toBeVisible();

    await page.getByRole('button', { name: 'Modifica messaggio' }).click();
    // Scoped to the inline edit form: its own <mat-label> shares the same text as the icon
    // button that opened it ("Modifica messaggio"), so getByLabel alone would be ambiguous.
    await page.locator('.comment-edit-form').getByRole('textbox').fill(updatedMessage);
    await page.getByRole('button', { name: 'Salva' }).click();

    await expect(page.getByRole('dialog').getByText(updatedMessage)).toBeVisible();
    await expect(page.getByRole('dialog').getByText(originalMessage)).toHaveCount(0);
    await expect(page.getByRole('dialog').getByText('(modificato)')).toBeVisible();
  });

  test('eliminare un messaggio lo fa sparire e aggiorna il contatore 💬 alla chiusura', async ({
    page,
  }) => {
    const title = uniqueTitle('elimina-msg');
    const message = uniqueTitle('da-eliminare');
    await createTask(page, title);
    const card = cardByTitle(page, title);
    await openDetailPanel(page, title);
    await page.getByLabel('Scrivi un messaggio').fill(message);
    await page.getByRole('button', { name: 'Invia' }).click();
    await expect(page.getByRole('dialog').getByText(message)).toBeVisible();

    await page.getByRole('button', { name: 'Elimina messaggio' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Elimina', exact: true }).click();

    await expect(page.getByRole('dialog').getByText(message)).toHaveCount(0);
    await page.getByRole('dialog').getByRole('button', { name: 'Chiudi' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(card.getByLabel('Commenti')).toContainText('0');
  });
});
