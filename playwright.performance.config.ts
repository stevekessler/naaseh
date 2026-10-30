import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  workers: 1,
  retries: 0,
  testDir: './tests/performance',
  testMatch: 'finance-browser.performance.spec.ts',
  webServer: process.env.PRODUCTION_BASE_URL
    ? undefined
    : {
        command:
          'npm exec -w @naaseh/web vite build -- --mode test && npm exec -w @naaseh/web vite preview -- --host 127.0.0.1',
        env: { VITE_DISABLE_BROWSER_AUDIO: 'true' },
        port: 4173,
        reuseExistingServer: true,
      },
  use: {
    baseURL: process.env.PRODUCTION_BASE_URL ?? 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
