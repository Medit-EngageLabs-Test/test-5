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
 * Resolves the App's internal id of the Task titled `title`, via the same `GET /api/tasks`
 * the Board itself calls — `page.request` carries the BFF session cookie in OIDC mode (a no-op
 * in open mode, where every endpoint is anonymous already).
 */
async function getTaskIdByTitle(page: Page, title: string): Promise<string> {
  const response = await page.request.get('/api/tasks');
  const tasks = (await response.json()) as Array<{ id: string; title: string }>;
  const task = tasks.find((t) => t.title === title);
  if (!task) {
    throw new Error(`Nessuna Attività trovata con titolo "${title}".`);
  }
  return task.id;
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

  /**
   * Status changes to Doing via the API, not via drag&drop: the drag→PATCH→Status mechanics are
   * F3's own concern, already covered by tasks.spec.ts:98's single-client drag test (passes
   * every run — no realtime, no other client to race). What F6 adds on top is only "a Status
   * change propagates live to another client", so this isolates exactly that from CDK's input
   * mechanics — which, on a Board crowded with the accumulated CI dataset, made the two-client
   * version of this test flake on drag geometry, not on anything realtime-specific.
   */
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

      const taskId = await getTaskIdByTitle(pageA, title);
      await pageA.request.patch(`/api/tasks/${taskId}/status`, { data: { status: 'Doing' } });

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
