import { expect, test } from '@playwright/test';
import { openCompletedTasks, signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block', acceptDownloads: true });

test('uses the browser zone silently and downloads the filtered task report', async ({ page }) => {
  await signIn(page);
  await openCompletedTasks(page);
  await expect(page.getByLabel('Time zone')).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export filtered CSV' }).click();
  expect((await download).suggestedFilename()).toBe('task-report-filtered.csv');
  await expect(page.getByText(/partial file/)).toHaveCount(0);
});
