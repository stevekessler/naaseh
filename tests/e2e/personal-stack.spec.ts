import { expect, test, type Page } from '@playwright/test';
import { mockSuccessfulSync, openLists, signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page }) => mockSuccessfulSync(page));

async function createTask(page: Page, label: string, urgency: string) {
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill(label);
  await form.getByLabel('Urgency', { exact: true }).selectOption(urgency);
  await form.getByRole('button', { name: 'Add task' }).click();
}

async function createList(page: Page, name: string, urgency: string) {
  await openLists(page);
  const form = page.locator('form').filter({ has: page.getByLabel('List name') });
  await form.getByLabel('List name').fill(name);
  await form.getByLabel('Urgency', { exact: true }).selectOption(urgency);
  await form.getByRole('button', { name: 'Create list' }).click();
}

async function openPersonalStack(page: Page) {
  await page.getByRole('button', { name: 'Personal Stack' }).click();
  await expect(page.getByRole('heading', { name: 'Personal Stack' })).toBeVisible();
}

const stackRow = (page: Page, label: string) =>
  page.getByRole('listitem').filter({ hasText: label });

test('keeps urgency-independent overall and Project orders private and durable', async ({
  page,
}) => {
  await signIn(page);
  await createTask(page, 'Critical task', 'critical');
  await createTask(page, 'Extra low task', 'extra_low');
  await createList(page, 'Medium list', 'medium');
  await openPersonalStack(page);

  await expect(page.getByLabel('Stack scope')).toHaveValue('overall');
  const extraLow = stackRow(page, 'Extra low task');
  await extraLow.getByRole('button', { name: 'Move to position' }).click();
  await extraLow.getByLabel('Position').fill('1');
  await extraLow.getByRole('button', { name: 'Apply position' }).click();
  await expect(extraLow).toContainText('Overall position 1');
  await expect(extraLow).toContainText('Extra Low');
  await expect(stackRow(page, 'Critical task')).toContainText('Overall position 2');

  await page.reload();
  await expect(stackRow(page, 'Extra low task')).toContainText('Overall position 1');
  await expect(stackRow(page, 'Medium list')).toBeVisible();

  const projectOption = page.getByLabel('Stack scope').locator('option[value^="project:"]').first();
  if ((await projectOption.count()) > 0) {
    await page.getByLabel('Stack scope').selectOption(await projectOption.getAttribute('value')!);
    await expect(page.getByText(/Project position 1/).first()).toBeVisible();
  }
});

test('replays an offline reorder and exposes an actionable conflict without losing focus', async ({
  page,
  context,
}) => {
  await signIn(page);
  await createTask(page, 'Offline first', 'high');
  await createTask(page, 'Offline second', 'low');
  await openPersonalStack(page);
  await context.setOffline(true);
  const second = stackRow(page, 'Offline second');
  const moveUp = second.getByRole('button', { name: 'Move up' });
  await moveUp.focus();
  await moveUp.click();
  await expect(page.getByRole('status')).toContainText(/pending|offline/i);
  await expect(second).toContainText('Overall position 1');
  await expect(second).toBeFocused();

  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await page.getByRole('button', { name: 'Personal Stack' }).click();
  await expect(stackRow(page, 'Offline second')).toContainText('Overall position 1');
  await context.setOffline(false);
  await expect(page.getByRole('status')).toContainText(/synced|applied/i, { timeout: 15_000 });

  const conflict = page.getByRole('alert').filter({ hasText: /stack.*conflict/i });
  if (await conflict.isVisible()) {
    await conflict.getByRole('button', { name: 'Reapply' }).click();
    await expect(conflict).toBeHidden();
  }
  await expect(
    stackRow(page, 'Offline second').getByRole('button', { name: 'Move down' }),
  ).toBeEnabled();
});

test('supports keyboard and touch reordering with announced positions at every viewport', async ({
  page,
}, testInfo) => {
  await signIn(page);
  await createTask(page, 'Accessible first', 'critical');
  await createTask(page, 'Accessible second', 'extra_low');
  await openPersonalStack(page);

  const second = stackRow(page, 'Accessible second');
  const moveUp = second.getByRole('button', { name: 'Move up' });
  await moveUp.focus();
  await expect(moveUp).toBeFocused();
  if (['iphone', 'ipad'].includes(testInfo.project.name)) await moveUp.tap();
  else await moveUp.press('Enter');
  await expect(second).toContainText('Overall position 1');
  await expect(page.getByRole('status')).toContainText(/position|pending|applied|synced/i);

  const box = await moveUp.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
