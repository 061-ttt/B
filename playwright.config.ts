import { defineConfig, devices } from '@playwright/test';

// ローカルでは入っている Chrome を使う（CI では Playwright の Chromium）
const chrome = process.env.PW_CHROME_PATH;
const gl = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8787',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: gl, ...(chrome ? { executablePath: chrome } : {}) },
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', browserName: 'chromium' },
    },
  ],
  webServer: {
    command: 'npx wrangler dev -c wrangler.local.jsonc --port 8787 --ip 127.0.0.1',
    url: 'http://127.0.0.1:8787/api/health',
    reuseExistingServer: true,
    timeout: 120_000,
    env: { WRANGLER_SEND_METRICS: 'false' },
  },
});
