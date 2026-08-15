import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { COMPLETED_TASK_CSV_HEADERS } from '@naaseh/contracts';
import { openCompletedTasks, signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block', acceptDownloads: true });

test('uses the browser zone silently and downloads only a verified completed-task export', async ({
  page,
}) => {
  const csv = `${COMPLETED_TASK_CSV_HEADERS.join(',')}\r\n`;
  const checksum = createHash('sha256').update(csv).digest('hex');
  await page.route('**/api/v1/reporting/completion-export', (route) =>
    route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'job-1',
        status: 'pending',
        schemaVersion: 'naaseh.completed-tasks/v1',
        asOf: '2026-08-14T12:00:00.000Z',
        downloadAvailable: false,
      }),
    }),
  );
  await page.route('**/api/v1/reporting/completion-export/job-1', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'job-1',
        status: 'completed',
        schemaVersion: 'naaseh.completed-tasks/v1',
        asOf: '2026-08-14T12:00:00.000Z',
        rowCount: 0,
        checksum,
        downloadAvailable: true,
        downloadUrl: 'http://127.0.0.1:4173/mock-completed-tasks.csv',
      }),
    }),
  );
  await page.route('**/mock-completed-tasks.csv', (route) =>
    route.fulfill({ status: 200, contentType: 'text/csv; charset=utf-8', body: csv }),
  );

  await signIn(page);
  await openCompletedTasks(page);
  await expect(page.getByLabel('Time zone')).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await download).suggestedFilename()).toBe('completed-tasks.csv');
  await expect(page.getByText(/partial file/)).toHaveCount(0);
});
