import { defineConfig, devices } from '@playwright/test';
import fullConfig from './playwright.config.js';

const chromiumJourneys = [
  'auth.spec.ts',
  'baseline.spec.ts',
  'tasks-list.spec.ts',
  'lists-basic.spec.ts',
  'archive-restore.spec.ts',
  'offline-sync.spec.ts',
  'reminders.spec.ts',
  'completion-dashboard.spec.ts',
  'responsive-accessibility.spec.ts',
  'responsive-layout.spec.ts',
  'responsive-dialogs.spec.ts',
  'responsive-state.spec.ts',
  'responsive-targets.spec.ts',
];

export default defineConfig({
  ...fullConfig,
  // Keep the required gate comfortably below ten minutes on a hosted runner.
  workers: 2,
  projects: [
    {
      name: 'chromium',
      testMatch: chromiumJourneys,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      testMatch: 'baseline.spec.ts',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'iphone',
      testMatch: 'baseline.spec.ts',
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'ipad',
      testMatch: 'baseline.spec.ts',
      use: { ...devices['iPad Pro 11'] },
    },
  ],
});
