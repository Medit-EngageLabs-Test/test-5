import { test, expect, Page } from '@playwright/test';

/**
 * A short but unique title so each test locates only the card it created — the Board is a
 * single, shared, global entity (CONTEXT.md "Board"), not a per-test fixture: every test reads
 * and writes the same rows through the same running backend (see playwright.config.ts's
 * `workers: 1` for how tests avoid racing each other over it).
 */
function uniqueTitle(label: string): string {
  return `E2E ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function openCreateDialog(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Nuova Attività' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

async function createTask(page: Page, title: string): Promise<void> {
  await openCreateDialog(page);
  await page.getByLabel('Titolo').fill(title);
  await page.getByRole('button', { name: 'Crea' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

test.describe('Attività — creare, modificare, spostare, eliminare (F3)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/board');
  });

  // ── #14 — Creare un'Attività ───────────────────────────────────────────────

  test("creare un'Attività la fa comparire in To Do", async ({ page }) => {
    const title = uniqueTitle('crea');

    await createTask(page, title);

    await expect(page.locator('.board-column[aria-label="To Do"]').getByText(title)).toBeVisible();
  });

  test('titolo obbligatorio: il submit senza titolo resta bloccato e mostra l’errore', async ({
    page,
  }) => {
    await openCreateDialog(page);

    await page.getByRole('button', { name: 'Crea' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Il titolo è obbligatorio.')).toBeVisible();
  });
});
