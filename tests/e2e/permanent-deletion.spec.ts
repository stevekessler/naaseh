import { expect, test } from '@playwright/test';
import { addTask, signIn } from './enhanced-helpers.js';

const job = {
  id: '01J00000000000000000000001',
  resourceType: 'task',
  resourceId: '01J00000000000000000000000',
  requestedBy: 'local-steve',
  requestMutationId: 'request-1',
  targetVersion: 1,
  dependencyDigest: 'a'.repeat(64),
  status: 'complete',
  progress: 100,
  checkpoint: { stage: 'complete' },
  createdAt: '2026-07-24T12:00:00.000Z',
  updatedAt: '2026-07-24T12:01:00.000Z',
  completedAt: '2026-07-24T12:01:00.000Z',
};

test('warns, cancels, confirms, reports progress, and purges only after success', async ({
  page,
}) => {
  await page.addInitScript(
    ({ completedJob }) => {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : input.toString();
        if (url.endsWith('/deletion-preview'))
          return new Response(
            JSON.stringify({
              resourceType: 'task',
              resourceId: completedJob.resourceId,
              displayLabel: 'Delete journey',
              targetVersion: 1,
              dependentCounts: { revisions: 2, attachments: 1 },
              blockers: [],
              reportingImpact: 'Completion history will be removed.',
              irreversible: true,
              expiresAt: '2099-01-01T00:00:00.000Z',
              confirmationToken: 'signed-confirmation-token',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        if ((init?.method ?? (input instanceof Request ? input.method : 'GET')) === 'DELETE')
          return new Response(JSON.stringify(completedJob), {
            status: 202,
            headers: { 'content-type': 'application/json' },
          });
        if (url.includes('/api/v1/deletion-jobs/'))
          return new Response(JSON.stringify(completedJob), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        return originalFetch(input, init);
      };
    },
    { completedJob: job },
  );
  await signIn(page);
  await addTask(page, 'Delete journey');
  await page.getByRole('heading', { name: 'Delete journey' }).click();
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('cannot be undone');
  await expect(dialog).toContainText('3 dependent records');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await dialog.getByRole('button', { name: 'Permanently delete' }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.locator('.task-list').getByText('Delete journey', { exact: true }),
  ).toBeHidden();
});

test('does not offer a false offline delete', async ({ page, context }) => {
  await signIn(page);
  await addTask(page, 'Offline delete');
  await page.getByRole('heading', { name: 'Offline delete' }).click();
  await context.setOffline(true);
  await expect(page.getByRole('button', { name: 'Delete permanently' })).toBeDisabled();
});
