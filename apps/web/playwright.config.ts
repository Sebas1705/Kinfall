import { defineConfig, devices } from '@playwright/test';

// Locally the machine's Microsoft Edge is used (no browser download). Firefox and WebKit only run in CI
// (or with PW_ALL=1 where they are installed).
const ci = Boolean(process.env.CI);
const channel = process.env.PW_CHANNEL ?? (ci ? undefined : 'msedge');
const allEngines = ci || Boolean(process.env.PW_ALL);
const PORT = 5199;

const chromiumUse = { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) };

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  // Locally, fewer workers keep the cold dev server from being swamped (CI keeps Playwright's default).
  ...(ci ? {} : { workers: 4 }),
  // Page loads and dynamic imports on a cold dev server can take longer than the 5 s default.
  expect: { timeout: 15_000 },
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  // Full animated battles are slower on a CI runner with software rendering.
  timeout: ci ? 120_000 : 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: chromiumUse },
    {
      name: 'mobile',
      use: {
        ...chromiumUse,
        viewport: { width: 320, height: 640 },
        hasTouch: true,
        isMobile: true,
      },
    },
    ...(allEngines
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        ]
      : []),
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !ci,
    timeout: 60_000,
  },
});
