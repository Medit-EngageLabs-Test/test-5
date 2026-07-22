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
    // A fresh dev/CI database has no Tasks yet (ticket #9 ships no write endpoint).
    const columns = page.locator('.board-column');
    await expect(columns).toHaveCount(3);
    for (const column of await columns.all()) {
      await expect(column.getByText('Nessuna Attività qui.')).toBeVisible();
    }
  });
});
