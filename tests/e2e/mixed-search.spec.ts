import { expect, test } from '@playwright/test';
import { addTask, createListWithItem, signIn } from './enhanced-helpers.js';

test('@enhanced-lists All, Lists, and To-do lists search works online and offline without query disclosure', async ({
  page,
  context,
}) => {
  await signIn(page);
  await createListWithItem(page, 'Saffron shopping', 'Saffron');
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await addTask(page, 'Saffron call');
  const filters = page.getByRole('region', { name: 'Search and filters' });
  await filters.getByLabel('Search').fill('saffron');
  await expect(filters.getByRole('status')).toHaveText('2 results');
  await filters.getByLabel('Content').selectOption('lists');
  await expect(filters.getByRole('status')).toHaveText('1 result');
  await filters.getByLabel('Content').selectOption('todos');
  await expect(page.getByRole('heading', { name: 'Saffron call' })).toBeVisible();
  await context.setOffline(true);
  await filters.getByLabel('Content').selectOption('all');
  await expect(filters.getByRole('status')).toHaveText('2 results');
  await expect(page).not.toHaveURL(/saffron/i);
});
