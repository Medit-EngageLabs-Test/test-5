import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('playwright.config', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('usa localhost:4201 come baseURL quando BASE_URL non è impostata', async () => {
    vi.stubEnv('BASE_URL', undefined as unknown as string);
    const { default: config } = await import('./playwright.config');
    expect(config.use?.baseURL).toBe('http://localhost:4201');
  });

  it('usa BASE_URL come baseURL quando è impostata', async () => {
    vi.stubEnv('BASE_URL', 'https://myapp.intelliflow.example.com');
    const { default: config } = await import('./playwright.config');
    expect(config.use?.baseURL).toBe('https://myapp.intelliflow.example.com');
  });

  it('avvia webServer quando BASE_URL non è impostata', async () => {
    vi.stubEnv('BASE_URL', undefined as unknown as string);
    const { default: config } = await import('./playwright.config');
    expect(config.webServer).toBeDefined();
  });

  it('non avvia webServer quando BASE_URL è impostata', async () => {
    vi.stubEnv('BASE_URL', 'https://myapp.intelliflow.example.com');
    const { default: config } = await import('./playwright.config');
    expect(config.webServer).toBeUndefined();
  });
});
