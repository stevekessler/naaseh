import { expect, test } from '@playwright/test';
import {
  expectContained,
  expectMinimumTarget,
  expectNoIntersection,
} from './responsive-assertions.js';

test('@enhanced-lists creates, completes, and retains a lightweight list item offline', async ({
  page,
  context,
}, testInfo) => {
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
  await page.getByText('Optional details', { exact: true }).click();
  await expect(page.getByLabel('File links (optional; one HTTPS link per line)')).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Memo formatting' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Memo' }).fill('Keep cold');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByLabel('Add an item')).toHaveValue('');
  await page.getByLabel('Add an item').fill('Eggs');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByText('Eggs', { exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'List items' })).toBeVisible();
  await expect(page.getByText('2 items', { exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Item' })).toBeVisible();
  const phoneLayout = (page.viewportSize()?.width ?? 1441) <= 640;
  const supportsSyntheticDrag = testInfo.project.name === 'chromium';
  await expect(page.getByRole('columnheader', { name: 'Saved links' })).toHaveCount(
    phoneLayout ? 0 : 1,
  );
  await expect(page.getByText('Keep cold', { exact: true })).toHaveCount(phoneLayout ? 0 : 1);
  await page.getByText('Columns', { exact: true }).click();
  if (phoneLayout) {
    await page.getByLabel('Show Memo column').check();
    await page.getByLabel('Show Saved links column').check();
    await expect(page.getByText('Keep cold', { exact: true })).toBeVisible();
  }
  await page.getByLabel('Show Saved links column').uncheck();
  await expect(page.getByRole('columnheader', { name: 'Saved links' })).toHaveCount(0);
  await page.getByLabel('Show Saved links column').check();
  await page.getByRole('button', { name: 'Close column settings' }).click();
  const item = page.locator('.list-item').filter({ hasText: 'Milk' });
  const eggs = page.locator('.list-item').filter({ hasText: 'Eggs' });
  if (supportsSyntheticDrag) await eggs.getByRole('button', { name: 'Drag Eggs' }).dragTo(item);
  await expect(page.locator('.list-item-name-cell')).toHaveText(
    supportsSyntheticDrag ? ['Eggs', 'Milk'] : ['Milk', 'Eggs'],
  );
  const complete = item.getByRole('button', { name: 'Complete Milk' });
  await expect(item.getByRole('button', { name: 'Drag Milk' })).toBeVisible();
  await expect(item.getByRole('button', { name: /Move Milk (?:up|down)/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Attachments' })).toBeHidden();
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
  await expect(editor.getByRole('heading', { name: 'Attachments' })).toBeVisible();
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
