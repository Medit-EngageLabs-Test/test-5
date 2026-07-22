import { test, expect, Page } from '@playwright/test';
import { newClientPage } from './two-client';

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

test.describe('Conversazione e allegati in tempo reale — due client (F6, ticket #24)', () => {
  test('A scrive un messaggio, B lo vede nel pannello aperto sulla stessa Attività senza reload', async ({
    browser,
  }) => {
    const pageA = await newClientPage(browser);
    const pageB = await newClientPage(browser);
    try {
      await pageA.goto('/board');
      await pageB.goto('/board');

      const title = uniqueTitle('conversazione-realtime');
      await createTask(pageA, title);
      await expect(cardByTitle(pageB, title)).toBeVisible();

      // Both open the same Task's detail panel before A writes, so B's dialog is already
      // subscribed to this Task's Comment events when the message is sent.
      await openDetailPanel(pageA, title);
      await openDetailPanel(pageB, title);
      const dialogA = pageA.getByRole('dialog', { name: title });
      const dialogB = pageB.getByRole('dialog', { name: title });

      const message = uniqueTitle('messaggio-realtime');
      await dialogA.getByLabel('Scrivi un messaggio').fill(message);
      await dialogA.getByRole('button', { name: 'Invia' }).click();
      await expect(dialogA.getByText(message)).toBeVisible();

      await expect(dialogB.getByText(message)).toBeVisible();
    } finally {
      await pageA.context().close();
      await pageB.context().close();
    }
  });

  test('il contatore 💬 si aggiorna su B in tempo reale anche a pannello chiuso', async ({
    browser,
  }) => {
    const pageA = await newClientPage(browser);
    const pageB = await newClientPage(browser);
    try {
      await pageA.goto('/board');
      await pageB.goto('/board');

      const title = uniqueTitle('contatore-msg-realtime');
      await createTask(pageA, title);
      const cardB = cardByTitle(pageB, title);
      await expect(cardB).toBeVisible();
      await expect(cardB.getByLabel('Commenti')).toContainText('0');

      await openDetailPanel(pageA, title);
      const dialogA = pageA.getByRole('dialog', { name: title });
      await dialogA.getByLabel('Scrivi un messaggio').fill(uniqueTitle('msg'));
      await dialogA.getByRole('button', { name: 'Invia' }).click();
      await expect(dialogA.getByText('Nessun messaggio ancora')).toHaveCount(0);

      await expect(cardB.getByLabel('Commenti')).toContainText('1');
    } finally {
      await pageA.context().close();
      await pageB.context().close();
    }
  });

  test('A allega un file, B lo vede nel pannello aperto sulla stessa Attività senza reload', async ({
    browser,
  }) => {
    const pageA = await newClientPage(browser);
    const pageB = await newClientPage(browser);
    try {
      await pageA.goto('/board');
      await pageB.goto('/board');

      const title = uniqueTitle('allegato-realtime');
      await createTask(pageA, title);
      await expect(cardByTitle(pageB, title)).toBeVisible();

      await openDetailPanel(pageA, title);
      await openDetailPanel(pageB, title);
      const dialogA = pageA.getByRole('dialog', { name: title });
      const dialogB = pageB.getByRole('dialog', { name: title });

      await dialogA.locator('.attachments-section input[type="file"]').setInputFiles({
        name: 'realtime.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(`contenuto e2e realtime ${Date.now()}`),
      });
      await expect(dialogA.getByText('realtime.txt')).toBeVisible();

      await expect(dialogB.getByText('realtime.txt')).toBeVisible();
    } finally {
      await pageA.context().close();
      await pageB.context().close();
    }
  });

  test('il contatore 📎 si aggiorna su B in tempo reale anche a pannello chiuso', async ({
    browser,
  }) => {
    const pageA = await newClientPage(browser);
    const pageB = await newClientPage(browser);
    try {
      await pageA.goto('/board');
      await pageB.goto('/board');

      const title = uniqueTitle('contatore-allegati-realtime');
      await createTask(pageA, title);
      const cardB = cardByTitle(pageB, title);
      await expect(cardB).toBeVisible();
      await expect(cardB.getByLabel('Allegati')).toContainText('0');

      await openDetailPanel(pageA, title);
      const dialogA = pageA.getByRole('dialog', { name: title });
      await dialogA.locator('.attachments-section input[type="file"]').setInputFiles({
        name: 'contatore-realtime.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('contenuto'),
      });
      await expect(dialogA.getByText('contatore-realtime.txt')).toBeVisible();

      await expect(cardB.getByLabel('Allegati')).toContainText('1');
    } finally {
      await pageA.context().close();
      await pageB.context().close();
    }
  });
});
