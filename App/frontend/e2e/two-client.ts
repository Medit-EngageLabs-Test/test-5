import { Browser, Page } from '@playwright/test';
import { STORAGE_STATE_PATH } from './global-setup';

/**
 * Opens a second (or first) independent browser context/page for a real-time two-client test
 * (F6, tickets #23/#24): `playwright.config.ts`'s `use.baseURL`/`use.storageState` only apply to
 * the fixture `page` Playwright hands a test — a context created by hand via `browser.newContext`
 * gets neither for free. Without this, the manually created context would be a *different*
 * session from the fixture one: fine locally (open mode, no session at all), but in CI
 * (`E2E_OIDC` set) it would carry no BFF session cookie, so its hub connection would be
 * unauthenticated and receive no events — a gap the local run cannot catch.
 */
export async function newClientPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    baseURL: process.env['BASE_URL'] ?? 'http://localhost:4201',
    storageState: process.env['E2E_OIDC'] ? STORAGE_STATE_PATH : undefined,
  });
  return context.newPage();
}
