import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { expandTaskDetails, mockSuccessfulSync, openLists, signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page }) => mockSuccessfulSync(page));

type Urgency = 'low' | 'medium' | 'high' | 'critical';

const urgencyLabels: Record<Urgency, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

async function chooseUrgency(container: Locator, urgency: Urgency) {
  await container.getByLabel('Priority', { exact: true }).selectOption(urgency);
}

async function createTask(page: Page, label: string, urgency: Urgency, parentLabel?: string) {
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill(label);
  await expandTaskDetails(form);
  await chooseUrgency(form, urgency);
  if (parentLabel) {
    await form.getByRole('combobox', { name: 'Parent task' }).fill(parentLabel);
    await page.getByRole('option', { name: parentLabel, exact: true }).click();
  }
  await form.getByRole('button', { name: 'Add task' }).click();
  const row = page
    .locator('li')
    .filter({ has: page.getByRole('heading', { name: label }) })
    .first();
  await expect(row.getByLabel(`Priority: ${urgencyLabels[urgency]}`)).toBeVisible();
  return row;
}

async function editSelectedTaskUrgency(page: Page, urgency: Urgency) {
  const dialog = page.getByRole('dialog', { name: 'Edit task' });
  await chooseUrgency(dialog, urgency);
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
}

async function createList(page: Page, name: string, urgency: Urgency) {
  await openLists(page);
  const form = page.locator('form').filter({ has: page.getByLabel('List name') });
  await form.getByLabel('List name').fill(name);
  await chooseUrgency(form, urgency);
  await form.getByRole('button', { name: 'Create list' }).click();
  const list = page.locator('.named-list').filter({ hasText: name });
  await expect(list.getByLabel(`Priority: ${urgencyLabels[urgency]}`)).toBeVisible();
  return list;
}

test('creates and edits Task, Subtask, and List urgency and retains it in history and archive', async ({
  page,
}) => {
  await signIn(page);

  await createTask(page, 'Urgent parent', 'critical');
  await page.getByRole('button', { name: 'Urgent parent', exact: true }).click();
  const detail = page.getByRole('dialog', { name: 'Edit task' }).getByLabel('Task details');
  const parentId = await detail.getAttribute('data-task-id');
  expect(parentId).toBeTruthy();

  await editSelectedTaskUrgency(page, 'low');
  await page.getByRole('button', { name: 'Urgent parent', exact: true }).click();
  const updatedDetail = page.getByRole('dialog', { name: 'Edit task' });
  await expect(updatedDetail.getByRole('heading', { name: 'Revision history' })).toBeVisible();
  const urgencyRevision = updatedDetail.locator('li').filter({ hasText: 'urgency' }).last();
  await expect(urgencyRevision).toBeVisible();
  await urgencyRevision.getByText('Safe changes').click();
  await expect(urgencyRevision.getByText(/"before"[\s\S]*critical/i)).toBeVisible();
  await expect(urgencyRevision.getByText(/"after"[\s\S]*Low/i)).toBeVisible();
  await updatedDetail.getByRole('button', { name: 'Cancel' }).click();

  await createTask(page, 'Urgent child', 'high', 'Urgent parent');
  await page.getByRole('button', { name: 'Urgent child', exact: true }).click();
  await editSelectedTaskUrgency(page, 'medium');

  await page.getByRole('button', { name: 'Complete Urgent parent' }).click();
  await expect(page.getByRole('heading', { name: 'Urgent parent' })).toBeHidden();

  const list = await createList(page, 'Urgent checklist', 'low');
  await chooseUrgency(list, 'critical');
  await expect(list.getByLabel('Priority: Critical')).toBeVisible();
  await list.getByRole('button', { name: 'Finish and archive list' }).click();

  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  const archivedTask = page.locator('article').filter({ hasText: 'Urgent parent' });
  const archivedList = page.locator('article').filter({ hasText: 'Urgent checklist' });
  await expect(archivedTask.getByLabel('Priority: Low')).toBeVisible();
  await expect(archivedList.getByLabel('Priority: Critical')).toBeVisible();
});

test('preserves offline urgency creation and edits through reconnect synchronization', async ({
  page,
  context,
}) => {
  await signIn(page);
  await createTask(page, 'Online urgency seed', 'medium');
  await page.getByRole('button', { name: 'Online urgency seed', exact: true }).click();
  const parentId = await page.getByLabel('Task details').getAttribute('data-task-id');
  expect(parentId).toBeTruthy();
  await page
    .getByRole('dialog', { name: 'Edit task' })
    .getByRole('button', { name: 'Cancel' })
    .click();

  await context.setOffline(true);
  await createTask(page, 'Offline urgent child', 'low', 'Online urgency seed');
  await page.getByRole('button', { name: 'Online urgency seed', exact: true }).click();
  await editSelectedTaskUrgency(page, 'critical');

  await expect(page.locator('html')).toHaveAttribute('data-online', 'false');

  await context.setOffline(false);
  await expect(page.locator('html')).toHaveAttribute('data-online', 'true');
  await expect(page.getByText('Synced').first()).toBeAttached({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(
    page
      .locator('li')
      .filter({ has: page.getByRole('heading', { name: 'Online urgency seed' }) })
      .getByLabel('Priority: Critical'),
  ).toBeVisible();
  await expect(
    page
      .locator('li')
      .filter({ has: page.getByRole('heading', { name: 'Offline urgent child' }) })
      .getByLabel('Priority: Low'),
  ).toBeVisible();
});

test('keeps urgency controls accessible to keyboard, touch, and screen readers at every viewport', async ({
  page,
}, testInfo) => {
  await signIn(page);
  const form = page.locator('.task-form').first();
  await expandTaskDetails(form);
  const urgency = form.getByLabel('Priority', { exact: true });

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
  await form.scrollIntoViewIfNeeded();
  const accessibility = await new AxeBuilder({ page })
    .include('.task-form')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});
