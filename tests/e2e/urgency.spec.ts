import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openLists, signIn } from './enhanced-helpers.js';

type Urgency = 'extra_low' | 'low' | 'medium' | 'high' | 'critical';

const urgencyLabels: Record<Urgency, string> = {
  extra_low: 'Extra Low',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

async function chooseUrgency(container: Locator, urgency: Urgency) {
  await container.getByLabel('Urgency', { exact: true }).selectOption(urgency);
}

async function createTask(page: Page, label: string, urgency: Urgency, parentId?: string) {
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill(label);
  await chooseUrgency(form, urgency);
  if (parentId) await form.getByLabel('Parent task').fill(parentId);
  await form.getByRole('button', { name: 'Add task' }).click();
  const row = page
    .locator('li')
    .filter({ has: page.getByRole('heading', { name: label }) })
    .first();
  await expect(row.getByText(urgencyLabels[urgency], { exact: true })).toBeVisible();
  return row;
}

async function editSelectedTaskUrgency(page: Page, urgency: Urgency) {
  const detail = page.getByLabel('Task details');
  await chooseUrgency(detail, urgency);
  await detail.getByRole('button', { name: 'Save changes' }).click();
  await expect(detail.getByText(urgencyLabels[urgency], { exact: true })).toBeVisible();
}

async function createList(page: Page, name: string, urgency: Urgency) {
  await openLists(page);
  const form = page.locator('form').filter({ has: page.getByLabel('List name') });
  await form.getByLabel('List name').fill(name);
  await chooseUrgency(form, urgency);
  await form.getByRole('button', { name: 'Create list' }).click();
  const list = page.locator('.named-list').filter({ hasText: name });
  await expect(list.getByText(urgencyLabels[urgency], { exact: true })).toBeVisible();
  return list;
}

test('creates and edits Task, Subtask, and List urgency and retains it in history and archive', async ({
  page,
}) => {
  await signIn(page);

  await createTask(page, 'Urgent parent', 'critical');
  await page.getByRole('heading', { name: 'Urgent parent' }).click();
  const detail = page.getByLabel('Task details');
  const parentId = await detail.getAttribute('data-task-id');
  expect(parentId).toBeTruthy();

  await editSelectedTaskUrgency(page, 'extra_low');
  await expect(detail.getByRole('heading', { name: 'Revision history' })).toBeVisible();
  const urgencyRevision = detail.locator('li').filter({ hasText: 'urgency' }).last();
  await expect(urgencyRevision).toBeVisible();
  await urgencyRevision.getByText('Safe changes').click();
  await expect(urgencyRevision.getByText(/"before"[\s\S]*critical/i)).toBeVisible();
  await expect(urgencyRevision.getByText(/"after"[\s\S]*extra_low/i)).toBeVisible();
  await detail.getByRole('button', { name: 'Close details' }).click();

  await createTask(page, 'Urgent child', 'high', parentId!);
  await page.getByRole('heading', { name: 'Urgent child' }).click();
  await editSelectedTaskUrgency(page, 'medium');
  await page.getByLabel('Task details').getByRole('button', { name: 'Close details' }).click();

  await page.getByRole('button', { name: 'Complete Urgent parent' }).click();
  await expect(page.getByRole('heading', { name: 'Urgent parent' })).toBeHidden();

  const list = await createList(page, 'Urgent checklist', 'low');
  await chooseUrgency(list, 'critical');
  await expect(list.getByText('Critical', { exact: true })).toBeVisible();
  await list.getByRole('button', { name: 'Finish and archive list' }).click();

  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  const archivedTask = page.locator('article').filter({ hasText: 'Urgent parent' });
  const archivedList = page.locator('article').filter({ hasText: 'Urgent checklist' });
  await expect(archivedTask.getByText('Extra Low', { exact: true })).toBeVisible();
  await expect(archivedList.getByText('Critical', { exact: true })).toBeVisible();
});

test('preserves offline urgency creation and edits through reconnect synchronization', async ({
  page,
  context,
}, testInfo) => {
  await signIn(page);
  if (testInfo.project.name === 'chromium')
    await page.evaluate(() => navigator.serviceWorker.ready);

  await createTask(page, 'Online urgency seed', 'medium');
  await page.getByRole('heading', { name: 'Online urgency seed' }).click();
  const parentId = await page.getByLabel('Task details').getAttribute('data-task-id');
  expect(parentId).toBeTruthy();
  await page.getByLabel('Task details').getByRole('button', { name: 'Close details' }).click();

  await context.setOffline(true);
  await createTask(page, 'Offline urgent child', 'extra_low', parentId!);
  await page.getByRole('heading', { name: 'Online urgency seed' }).click();
  await editSelectedTaskUrgency(page, 'critical');
  await page.getByLabel('Task details').getByRole('button', { name: 'Close details' }).click();

  const list = await createList(page, 'Offline urgent list', 'high');
  await chooseUrgency(list, 'low');
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByRole('status').filter({ hasText: 'Synced' })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(
    page
      .locator('li')
      .filter({ has: page.getByRole('heading', { name: 'Online urgency seed' }) })
      .getByText('Critical', { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator('li')
      .filter({ has: page.getByRole('heading', { name: 'Offline urgent child' }) })
      .getByText('Extra Low', { exact: true }),
  ).toBeVisible();

  await openLists(page);
  await expect(
    page
      .locator('.named-list')
      .filter({ hasText: 'Offline urgent list' })
      .getByText('Low', { exact: true }),
  ).toBeVisible();
});

test('keeps urgency controls accessible to keyboard, touch, and screen readers at every viewport', async ({
  page,
}, testInfo) => {
  await signIn(page);
  const form = page.locator('.task-form').first();
  const urgency = form.getByLabel('Urgency', { exact: true });

  await urgency.focus();
  await expect(urgency).toBeFocused();
  if (['iphone', 'ipad'].includes(testInfo.project.name)) await urgency.tap();
  else await urgency.press('End');
  await urgency.selectOption('critical');
  await expect(urgency).toHaveValue('critical');
  await expect(page.getByRole('status').first()).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
  const accessibility = await new AxeBuilder({ page })
    .include('.task-form')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
