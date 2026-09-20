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
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByRole('button', { name: 'Categories & Projects', exact: true }).click();
  const region = page.getByRole('region', { name: 'Categories and Projects' });
  await region.getByText('Add category', { exact: true }).click();
  const categoryForm = region.locator('form').filter({ hasText: 'Save category' });
  await categoryForm.getByLabel('Name').fill('PAAO');
  await categoryForm.getByRole('button', { name: 'Save category' }).click();
  await region.getByText('Add project', { exact: true }).click();
  const projectForm = region.locator('form').filter({ hasText: 'Create Project' });
  await projectForm.getByLabel('Category').selectOption({ label: 'PAAO' });
  await projectForm.getByLabel('Project name').fill('API');
  await projectForm.getByRole('button', { name: 'Create Project' }).click();
  await region.getByRole('button', { name: 'Edit Category' }).first().click();
  const categoryDialog = page.getByRole('dialog', { name: 'Edit category: PAAO' });
  const categorySave = await categoryDialog
    .getByRole('button', { name: 'Save category' })
    .boundingBox();
  const categoryCancel = await categoryDialog.getByRole('button', { name: 'Cancel' }).boundingBox();
  expect(categorySave).not.toBeNull();
  expect(categoryCancel).not.toBeNull();
  expect(Math.abs(categorySave!.y - categoryCancel!.y)).toBeLessThan(8);
  expect(categoryCancel!.x).toBeGreaterThan(categorySave!.x);
  await categoryDialog.getByRole('button', { name: 'Cancel' }).click();
  await context.setOffline(true);
  await region.getByRole('button', { name: 'Archive Project' }).click();
  await expect(region).toContainText('Archived');
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByLabel('Project').getByRole('option', { name: 'API' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByRole('button', { name: 'Categories & Projects', exact: true }).click();
  await region.getByRole('button', { name: 'Restore Project' }).click();
  await context.setOffline(false);
  await expect(region.getByRole('button', { name: 'Edit Category' }).first()).toBeVisible();
  const apiRow = region.locator('li').filter({ hasText: 'API' }).last();
  const deleteButton = apiRow.getByRole('button', { name: 'Delete permanently' });
  await expect(deleteButton).toBeDisabled();
  await expect(deleteButton).toHaveAttribute('title', /finish syncing/);
});
