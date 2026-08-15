import { expect, test } from '@playwright/test';
import { expandTaskDetails, signIn } from './enhanced-helpers.js';

test('shows exact Category/Project/Unassigned counts and date state online and offline', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Admin' }).click();
  const organization = page.getByRole('region', { name: 'Categories and Projects' });
  const categoryForm = organization.locator('form').filter({ hasText: 'Save category' });
  await categoryForm.getByLabel('Name').fill('PAAO');
  await categoryForm.getByRole('button', { name: 'Save category' }).click();
  const projectForm = organization.locator('form').filter({ hasText: 'Create Project' });
  await projectForm.getByLabel('Category').selectOption({ label: 'PAAO' });
  await projectForm.getByLabel('Project name').fill('API');
  await projectForm.getByLabel('End date').fill('2020-01-01');
  await projectForm.getByRole('button', { name: 'Create Project' }).click();

  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  const taskForm = page.locator('.task-form').first();
  await taskForm.getByLabel('Task label').fill('Assigned work');
  await expandTaskDetails(taskForm);
  await taskForm.getByLabel('Project').selectOption({ label: 'API' });
  await taskForm.getByRole('button', { name: 'Add task' }).click();
  await page.getByRole('button', { name: 'Lists', exact: true }).click();
  const listForm = page.locator('.task-form').first();
  await listForm.getByLabel('List name').fill('Assigned list');
  await listForm.getByLabel('Project').selectOption({ label: 'API' });
  await listForm.getByRole('button', { name: 'Create list' }).click();

  await page.getByRole('button', { name: 'Projects' }).click();
  await context.setOffline(true);
  const tree = page.locator('.project-workload-tree');
  const category = tree.locator('li').filter({ hasText: 'PAAO' }).first();
  await expect(category).toContainText('1 to-dos');
  await expect(category).toContainText('1 lists');
  const project = tree.locator('li').filter({ hasText: 'API' }).first();
  await expect(project).toContainText('overdue');
  await expect(project).toContainText('2 remaining');
  await expect(tree.getByText('Unassigned to a project', { exact: true })).toBeVisible();
  await context.setOffline(false);
});
