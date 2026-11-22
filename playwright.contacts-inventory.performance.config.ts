import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config.js';

export default defineConfig({
  ...base,
  testDir: './tests/performance',
  testMatch: 'contacts-inventory.performance.spec.ts',
  workers: 1,
  projects: [{ name: 'throttled-mobile', use: { ...devices['Pixel 7'] } }],
});
