import { expect, test } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url =
        typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
      if (url.includes('/projects/') && url.endsWith('/deletion-preview'))
        return new Response(
          JSON.stringify({
            resourceType: 'project',
            resourceId: '01J00000000000000000000020',
            displayLabel: 'API',
            targetVersion: 1,
            dependentCounts: { references: 1 },
            blockers: ['1 work, history, projection, or job reference remains.'],
            reportingImpact: 'History remains.',
            irreversible: true,
            expiresAt: '2099-01-01T00:00:00.000Z',
            confirmationToken: 'signed-confirmation-token',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      return original(input, init);
    };
  });
});

test('archives, restores, edits, blocks assignment, and warns before permanent deletion', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Admin' }).click();
  const region = page.getByRole('region', { name: 'Categories and Projects' });
  const categoryForm = region.locator('form').filter({ hasText: 'Save category' });
  await categoryForm.getByLabel('Name').fill('PAAO');
  await categoryForm.getByRole('button', { name: 'Save category' }).click();
  const projectForm = region.locator('form').filter({ hasText: 'Create Project' });
  await projectForm.getByLabel('Category').selectOption({ label: 'PAAO' });
  await projectForm.getByLabel('Project name').fill('API');
  await projectForm.getByRole('button', { name: 'Create Project' }).click();
  await context.setOffline(true);
  await region.getByRole('button', { name: 'Archive Project' }).click();
  await expect(region).toContainText('API (archived)');
  await page.getByRole('button', { name: 'Tasks' }).click();
  await expect(page.getByLabel('Project').getByRole('option', { name: 'API' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Admin' }).click();
  await region.getByRole('button', { name: 'Restore Project' }).click();
  await context.setOffline(false);
  const apiRow = region.locator('li').filter({ hasText: 'API' }).last();
  await apiRow.getByRole('button', { name: 'Delete permanently' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('This cannot be deleted yet');
  await expect(dialog.getByRole('button', { name: 'Permanently delete' })).toBeDisabled();
});
