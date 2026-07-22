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

/**
 * Drags the card titled `title` into `targetColumnLabel`'s drop list — copied from
 * tasks.spec.ts's own helper (kept file-local: two-client tests operate on two independent
 * Page objects, and sharing the helper would mean threading both through every call).
 */
async function dragCardToColumn(
  page: Page,
  title: string,
  targetColumnLabel: string,
): Promise<void> {
  const card = cardByTitle(page, title);
  const targetDropList = page.locator(
    `.board-column[aria-label="${targetColumnLabel}"] .column-drop-list`,
  );

  const cardBox = await card.boundingBox();
  const targetBox = await targetDropList.boundingBox();
  if (!cardBox || !targetBox) {
    throw new Error('Bounding box non disponibile: impossibile calcolare il drag&drop.');
  }

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 10, { steps: 10 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 10,
  });
  await page.mouse.up();
}

test.describe('Board in tempo reale — due client (F6, ticket #23)', () => {
  test('A crea un’Attività, B la vede comparire senza reload', async ({ browser }) => {
    const pageA = await newClientPage(browser);
    const pageB = await newClientPage(browser);
    try {
      await pageA.goto('/board');
      await pageB.goto('/board');
      // Both Boards loaded before A acts, so B's hub connection is already listening.
      await expect(pageA.getByRole('heading', { name: 'Board' })).toBeVisible();
      await expect(pageB.getByRole('heading', { name: 'Board' })).toBeVisible();

      const title = uniqueTitle('realtime-crea');
      await createTask(pageA, title);

      await expect(cardByTitle(pageB, title)).toBeVisible();
    } finally {
      await pageA.context().close();
      await pageB.context().close();
    }
  });

  test('A sposta un’Attività tra colonne, B vede la card nella nuova colonna senza reload', async ({
    browser,
  }) => {
    const pageA = await newClientPage(browser);
    const pageB = await newClientPage(browser);
    try {
      await pageA.goto('/board');
      await pageB.goto('/board');
      await expect(pageA.getByRole('heading', { name: 'Board' })).toBeVisible();
      await expect(pageB.getByRole('heading', { name: 'Board' })).toBeVisible();

      const title = uniqueTitle('realtime-sposta');
      await createTask(pageA, title);
      await expect(cardByTitle(pageB, title)).toBeVisible();

      await dragCardToColumn(pageA, title, 'Doing');

      await expect(
        pageB.locator('.board-column[aria-label="Doing"]').getByText(title),
      ).toBeVisible();
      await expect(pageB.locator('.board-column[aria-label="To Do"]').getByText(title)).toHaveCount(
        0,
      );
    } finally {
      await pageA.context().close();
      await pageB.context().close();
    }
  });

  test('A elimina un’Attività, B la vede sparire senza reload', async ({ browser }) => {
    const pageA = await newClientPage(browser);
    const pageB = await newClientPage(browser);
    try {
      await pageA.goto('/board');
      await pageB.goto('/board');
      await expect(pageA.getByRole('heading', { name: 'Board' })).toBeVisible();
      await expect(pageB.getByRole('heading', { name: 'Board' })).toBeVisible();

      const title = uniqueTitle('realtime-elimina');
      await createTask(pageA, title);
      await expect(cardByTitle(pageB, title)).toBeVisible();

      await cardByTitle(pageA, title).getByRole('button', { name: 'Elimina Attività' }).click();
      await expect(pageA.getByRole('dialog')).toBeVisible();
      await pageA.getByRole('button', { name: 'Elimina', exact: true }).click();

      await expect(cardByTitle(pageB, title)).toHaveCount(0);
    } finally {
      await pageA.context().close();
      await pageB.context().close();
    }
  });
});
