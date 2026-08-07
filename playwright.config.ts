import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Give hosted CI runners the full machine while retaining local parallelism.
  workers: process.env.CI ? 1 : 2,
  // A retry gets a fresh worker and browser without rerunning the entire workflow.
  retries: process.env.CI ? 1 : 0,
  metadata: { featureSet: 'enhanced-list-management' },
  testDir: './tests/e2e',
  webServer: process.env.PRODUCTION_BASE_URL
    ? undefined
    : {
        command:
          'npm exec -w @naaseh/web vite build -- --mode test && npm exec -w @naaseh/web vite preview -- --host 127.0.0.1',
        port: 4173,
        reuseExistingServer: true,
      },
  use: {
    baseURL: process.env.PRODUCTION_BASE_URL ?? 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
    { name: 'ipad', use: { ...devices['iPad Pro 11'] } },
  ],
});
