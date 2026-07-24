import { expect, type Page } from '@playwright/test';

export async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Ready when you are/ })).toBeVisible();
}

export async function openLists(page: Page) {
  await page.getByRole('button', { name: 'Lists', exact: true }).click();
  await page
    .waitForURL(/\/lists(?:\/|$)/, { timeout: 1_000 })
    .catch(async () => page.goto('/lists'));
  await expect(page.getByRole('heading', { name: 'Lists', exact: true })).toBeVisible();
}

export async function createListWithItem(page: Page, listName: string, itemName: string) {
  await openLists(page);
  await page.getByLabel('List name').fill(listName);
  await page.getByRole('button', { name: 'Create list' }).click();
  const list = page.locator('.named-list').filter({ hasText: listName });
  await list.getByLabel('Add an item').fill(itemName);
  await list.getByRole('button', { name: 'Add item' }).click();
  await expect(list.getByText(itemName, { exact: true })).toBeVisible();
  return list;
}

export async function addTask(page: Page, label: string) {
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill(label);
  await form.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByRole('heading', { name: label })).toBeVisible();
}
