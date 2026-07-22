import { test, expect } from '@playwright/test';

test.describe('Board', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // The default route redirects to /board (ticket #10).
    await expect(page).toHaveURL('/board');
  });

  test('mostra le tre colonne To Do, Doing e Done', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Board' })).toBeVisible();
    await expect(page.locator('.board-column[aria-label="To Do"]')).toBeVisible();
    await expect(page.locator('.board-column[aria-label="Doing"]')).toBeVisible();
    await expect(page.locator('.board-column[aria-label="Done"]')).toBeVisible();
  });

  test('senza Attività ogni colonna mostra lo stato vuoto', async ({ page }) => {
    // No longer a fresh-database given: F3 (tickets #14-#17) ships write endpoints, and the
    // Board is a single shared, un-isolated entity (CONTEXT.md) — a previous test run (or a
    // developer clicking around) may have left Tasks behind. Clear it first through the same
    // DELETE the UI's own command uses (ticket #17) instead of assuming an empty database.
    const existing = await page.request.get('/api/tasks');
    const tasks = (await existing.json()) as Array<{ id: string }>;
    await Promise.all(tasks.map((task) => page.request.delete(`/api/tasks/${task.id}`)));
    await page.reload();

    const columns = page.locator('.board-column');
    await expect(columns).toHaveCount(3);
    for (const column of await columns.all()) {
      await expect(column.getByText('Nessuna Attività qui.')).toBeVisible();
    }
  });
});
