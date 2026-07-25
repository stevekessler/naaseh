import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // WebKit's four device projects can exhaust the local preview process when
  // the complete suite fans out; two workers keeps the release gate stable.
  workers: 2,
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
