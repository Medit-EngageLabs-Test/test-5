import { chromium } from '@playwright/test';

/**
 * Storage-state path shared with the Playwright config: holds the BFF session cookie
 * obtained by signing in on the mock identity provider.
 */
export const STORAGE_STATE_PATH = 'e2e/.auth/storage-state.json';

/**
 * With `E2E_OIDC` set (CI), the backend runs behind the OIDC portal contract pointed at the
 * mock identity provider: this setup signs in once — directly against the backend, which,
 * unlike the Angular dev server, is already listening when Playwright runs the global setup —
 * and saves the session cookie into the storage state reused by every test. Cookies are
 * per-host (the port is irrelevant), so a session obtained on :5281 is also valid through
 * the :4201 proxy. Without `E2E_OIDC` the backend runs unauthenticated (platform off) and
 * no sign-in is needed.
 */
export default async function globalSetup(): Promise<void> {
  if (!process.env['E2E_OIDC']) {
    return;
  }

  // Default user: "e2e", seeded by CI with every role declared in roles.json, so the
  // CRUD suite always has full access. Per-role users ("e2e-<role value>") are also
  // seeded and can be selected via E2E_OIDC_USERNAME for role-specific scenarios.
  const backendUrl = process.env['E2E_BACKEND_URL'] ?? 'http://localhost:5281';
  const username = process.env['E2E_OIDC_USERNAME'] ?? 'e2e';
  const password = process.env['E2E_OIDC_PASSWORD'] ?? 'e2e-password';

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();

    // /api/auth/login starts the OIDC code flow: it lands on the mock's login page.
    await page.goto(`${backendUrl}/api/auth/login?returnUrl=/health`);
    await page.locator('input[name="Input.Username"]').fill(username);
    await page.locator('input[name="Input.Password"]').fill(password);
    await page.locator('button[name="Input.Button"][value="login"]').click();

    // Round-trip complete: callback consumed, session cookie issued, back on /health.
    await page.waitForURL(`${backendUrl}/health`);
    await page.context().storageState({ path: STORAGE_STATE_PATH });
  } finally {
    await browser.close();
  }
}
