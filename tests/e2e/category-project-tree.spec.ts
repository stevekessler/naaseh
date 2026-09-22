import { expect, test } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

test('administrator manages a two-level tree with parent-scoped Project names offline', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByRole('button', { name: 'Categories & Projects', exact: true }).click();
  const organization = page.getByRole('region', { name: 'Categories and Projects' });
  await organization.getByText('Add category', { exact: true }).click();
  const categoryForm = organization.locator('form').filter({ hasText: 'Save category' });
  await categoryForm.getByLabel('Name').fill('PAAO');
  await categoryForm.getByLabel('Color').fill('#336699');
  await categoryForm.getByRole('button', { name: 'Save category' }).click();
  await expect(
    organization.locator('.organization-tree summary').filter({ hasText: 'PAAO' }),
  ).toBeVisible();

  await context.setOffline(true);
  await organization.getByText('Add project', { exact: true }).click();
  const projectForm = organization.locator('form').filter({ hasText: 'Create Project' });
  await projectForm.getByLabel('Category').selectOption({ label: 'PAAO' });
  await projectForm.getByLabel('Project name').fill('API');
  await projectForm.getByLabel('End date').fill('2026-12-31');
  await projectForm.getByRole('button', { name: 'Create Project' }).click();
  await expect(organization.getByText('API', { exact: true })).toBeVisible();
  await expect(organization).toContainText('Ends 2026-12-31');

  await context.setOffline(false);
  await categoryForm.getByLabel('Name').fill('Another Category');
  await categoryForm.getByRole('button', { name: 'Save category' }).click();
  await expect(categoryForm.getByLabel('Name')).toHaveValue('');
  await projectForm.getByLabel('Category').selectOption({ label: 'Another Category' });
  await projectForm.getByLabel('Project name').fill('API');
  await projectForm.getByRole('button', { name: 'Create Project' }).click();
  await expect(organization.getByText('API', { exact: true })).toHaveCount(2);
  await expect(organization.locator('.organization-tree')).toBeVisible();
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  const taskForm = page.locator('.task-form').first();
  await taskForm.getByText('Task details', { exact: true }).click();
  await expect(
    taskForm.getByLabel('Category').getByRole('option', { name: 'PAAO' }),
  ).toBeAttached();
  await expect(taskForm.getByLabel('Project').getByRole('option', { name: 'API' })).toHaveCount(2);
});

test('work forms expose explicit Category and Project assignments', async ({ page }) => {
  await signIn(page);
  const form = page.locator('.task-form').first();
  await expect(form.getByLabel('Project')).toHaveValue('');
  await expect(
    form.getByLabel('Project').getByRole('option', { name: 'Unassigned' }),
  ).toBeAttached();
  await expect(form.getByLabel('Category')).toHaveValue('');
});
