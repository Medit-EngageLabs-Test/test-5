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

function cardByTitle(page: Page, title: string) {
  return page.locator('.task-card-drag', { hasText: title });
}

/**
 * Drags the card titled `title` into `targetColumnLabel`'s drop list. Angular CDK only starts
 * tracking a drag once the pointer has moved past an internal threshold, so a single mouse jump
 * from the card to the target is not enough — the move is broken into several intermediate steps.
 */
async function dragCardToColumn(page: Page, title: string, targetColumnLabel: string): Promise<void> {
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
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
  await page.mouse.up();
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

  // ── #15 — Modificare un'Attività ────────────────────────────────────────────

  test("modificare un'Attività ne aggiorna la card", async ({ page }) => {
    const originalTitle = uniqueTitle('modifica-originale');
    const updatedTitle = uniqueTitle('modifica-aggiornata');
    await createTask(page, originalTitle);

    await cardByTitle(page, originalTitle).getByRole('button', { name: 'Modifica Attività' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Titolo').fill(updatedTitle);
    await page.getByRole('button', { name: 'Salva' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await expect(page.getByText(updatedTitle)).toBeVisible();
    await expect(page.getByText(originalTitle)).toHaveCount(0);
  });

  // ── #16 — Spostare tra colonne ───────────────────────────────────────────────

  test('il drag&drop tra colonne diverse sposta la card e ne cambia lo Status', async ({ page }) => {
    const title = uniqueTitle('drag');
    await createTask(page, title);
    await expect(page.locator('.board-column[aria-label="To Do"]').getByText(title)).toBeVisible();

    await dragCardToColumn(page, title, 'Doing');

    await expect(page.locator('.board-column[aria-label="Doing"]').getByText(title)).toBeVisible();
    await expect(page.locator('.board-column[aria-label="To Do"]').getByText(title)).toHaveCount(0);
  });

  // ── #17 — Eliminare (creatore o Moderatore) ─────────────────────────────────

  test("eliminare un'Attività la fa sparire dalla Board (come creatore)", async ({ page }) => {
    const title = uniqueTitle('elimina');
    await createTask(page, title);

    await cardByTitle(page, title).getByRole('button', { name: 'Elimina Attività' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Elimina', exact: true }).click();

    await expect(page.getByText(title)).toHaveCount(0);
  });
});
