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

test.describe('Allegati sulle Attività e sui messaggi (F5, tickets #20-#21)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/board');
  });

  test('allegare un file a un\'Attività lo mostra in lista e lo si può scaricare', async ({
    page,
  }) => {
    const title = uniqueTitle('allegato');
    await createTask(page, title);
    await openDetailPanel(page, title);
    const dialog = page.getByRole('dialog', { name: title });

    await dialog
      .locator('.attachments-section input[type="file"]')
      .setInputFiles({
        name: 'nota.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(`contenuto e2e ${Date.now()}`),
      });

    await expect(dialog.getByText('nota.txt')).toBeVisible();
    await expect(dialog.getByText('Nessun allegato.')).toHaveCount(0);

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('link', { name: 'Scarica allegato' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('nota.txt');
  });

  test('il contatore 📎 sulla card si aggiorna dopo aver allegato un file', async ({ page }) => {
    const title = uniqueTitle('contatore-allegati');
    await createTask(page, title);
    const card = cardByTitle(page, title);
    await expect(card.getByLabel('Allegati')).toContainText('0');

    await openDetailPanel(page, title);
    const dialog = page.getByRole('dialog', { name: title });
    await dialog
      .locator('.attachments-section input[type="file"]')
      .setInputFiles({
        name: 'contatore.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('contenuto'),
      });
    await expect(dialog.getByText('contatore.txt')).toBeVisible();

    await dialog.getByRole('button', { name: 'Chiudi' }).click();
    await expect(dialog).toBeHidden();

    await expect(card.getByLabel('Allegati')).toContainText('1');
  });

  // ── #21 — Allegare file a un messaggio ──────────────────────────────────────

  test('allegare un file a un messaggio lo mostra sotto il messaggio e aggiorna il contatore 📎', async ({
    page,
  }) => {
    const title = uniqueTitle('allegato-messaggio');
    const message = uniqueTitle('messaggio-con-allegato');
    await createTask(page, title);
    const card = cardByTitle(page, title);
    await openDetailPanel(page, title);
    const dialog = page.getByRole('dialog', { name: title });

    await dialog.getByLabel('Scrivi un messaggio').fill(message);
    await dialog.getByRole('button', { name: 'Invia' }).click();
    await expect(dialog.getByText(message)).toBeVisible();

    const commentItem = dialog.locator('.comment', { hasText: message });
    await commentItem
      .locator('input[type="file"]')
      .setInputFiles({
        name: 'allegato-messaggio.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(`allegato di un messaggio ${Date.now()}`),
      });

    await expect(commentItem.getByText('allegato-messaggio.txt')).toBeVisible();
    // The Task-level section stays empty — this Attachment belongs to the Comment, not the Task
    // directly — even though the 📎 badge on the card counts it too (ticket #21).
    await expect(dialog.locator('.attachments-section').getByText('Nessun allegato.')).toBeVisible();

    await dialog.getByRole('button', { name: 'Chiudi' }).click();
    await expect(dialog).toBeHidden();
    await expect(card.getByLabel('Allegati')).toContainText('1');
  });
});
