import { expect, test } from '@playwright/test';
import {
  expectContained,
  expectMinimumTarget,
  expectNoIntersection,
} from './responsive-assertions.js';

test('@enhanced-lists creates, completes, and retains a lightweight list item offline', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Lists', exact: true }).click();
  await page.getByLabel('List name').fill('Groceries');
  await page.getByRole('button', { name: 'Create list' }).click();
  await expect(page.getByRole('heading', { name: 'Groceries' })).toBeVisible();
  await expect(page.getByText('Visibility', { exact: true })).toBeHidden();
  await page.getByText('List settings', { exact: true }).click();
  await expect(page.getByText('Visibility', { exact: true })).toBeVisible();
  await page.getByText('List settings', { exact: true }).click();
  await page.getByLabel('Add an item').fill('Milk');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByRole('table', { name: 'List items' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Item' })).toBeVisible();
  const item = page.locator('.list-item').filter({ hasText: 'Milk' });
  const complete = item.getByRole('button', { name: 'Complete Milk' });
  await expectMinimumTarget(complete);
  await expect
    .poll(() => complete.evaluate((element) => getComputedStyle(element, '::before').width))
    .toBe('24px');
  await expectNoIntersection(
    item.locator('.list-item-name-cell'),
    item.locator('.list-item-actions'),
  );

  await item.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('table', { name: 'List items' }).locator('.list-item-editor');
  await expect(editor).toBeVisible();
  await expectContained(editor.getByLabel('Item name'), editor);
  await expect(editor.getByLabel('Amount')).toHaveCount(0);
  await expectNoIntersection(
    editor.getByLabel('Item name'),
    editor.getByRole('button', { name: 'Save item' }),
  );

  await complete.click();
  await expect(page.getByText('Milk completed.')).toBeAttached();
  await context.setOffline(true);
  await expect(page.getByText('Milk', { exact: true })).toBeVisible();
  await expect(page.getByLabel('List total')).toHaveCount(0);
});
