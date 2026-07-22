import { defineConfig, devices } from '@playwright/test';
import { STORAGE_STATE_PATH } from './e2e/global-setup';

/**
 * Playwright E2E configuration.
 *
 * The backend (ASP.NET Core) must be running on port 5281 before running tests.
 * Start it with: dotnet run --project ../App.csproj
 *
 * The Angular dev server is started automatically by this config via `webServer`.
 *
 * Authenticated mode (CI): with E2E_OIDC set, the backend runs behind the OIDC portal
 * contract pointed at a local mock identity provider (see "Start mock identity provider"
 * in .github/workflows/build.yml for the exact container and its per-role users), and
 * e2e/global-setup.ts signs in once, reusing the session via storageState. Without
 * E2E_OIDC the backend runs unauthenticated and role-gated mutations are rejected —
 * run the mock locally with the same docker command to exercise the full CRUD.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',

  /* With E2E_OIDC set (CI), sign in once on the mock identity provider and reuse the
   * BFF session cookie in every test via storageState — see e2e/global-setup.ts. */
  globalSetup: './e2e/global-setup.ts',

  /* Maximum time one test can run */
  timeout: 30_000,

  /* Reporter: always list (console) + HTML (file).
   * HTML is generated even in CI so the artifact upload has something to show
   * when tests fail — traces and screenshots are embedded in the report. */
  reporter: [['list'], ['html', { open: 'never' }]],

  /* Shared settings for all tests */
  use: {
    baseURL: process.env['BASE_URL'] ?? 'http://localhost:4201',
    storageState: process.env['E2E_OIDC'] ? STORAGE_STATE_PATH : undefined,
    trace: 'on-first-retry',    // capture trace on first retry — invaluable for diagnosis
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /**
   * Start the Angular dev server automatically before the test run.
   * The backend must already be running (see instructions above).
   */
  // When BASE_URL is set (e.g. in CI smoke-test), the app is already running remotely — no local server needed.
  webServer: process.env['BASE_URL'] ? undefined : {
    command: 'npm run start -- --port 4201',
    url: 'http://localhost:4201',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
