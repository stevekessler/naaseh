import { expect, test, type Page } from '@playwright/test';
import { expandTaskDetails } from './enhanced-helpers.js';

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Ready when you are/ })).toBeVisible();
}

test('creates, edits, completes, and inspects a responsive task with revisions and reminders', async ({
  page,
}) => {
  await signIn(page);
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill('Call the contractor');
  await expect(form.locator('.task-form-details')).not.toHaveAttribute('open', '');
  await expandTaskDetails(form);
  await form.getByLabel('Link', { exact: true }).fill('https://example.com/project');
  await form
    .getByRole('textbox', { name: 'Memo', exact: true })
    .fill('Ask for an updated estimate');
  await form.getByLabel('Due').selectOption('timed');
  await form.locator('input[type="date"]').fill('2020-01-01');
  await form.getByLabel('Due time').selectOption('09:00');
  await expect(form.getByLabel('Assignee')).toHaveValue('local-steve');
  await form.getByLabel('Private task').check();
  await form.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByRole('heading', { name: 'Call the contractor' })).toBeVisible();
  await expect(page.getByText('Overdue', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Call the contractor', exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\//);
  const detail = page.getByLabel('Task details');
  const dialog = page.getByRole('dialog', { name: 'Edit task' });
  await expect(detail.getByRole('heading', { name: 'Revision history' })).toBeVisible();
  await expect(detail.getByText(/create by local-steve/)).toBeVisible();
  await dialog.getByLabel('Task label').fill('Call the contractor today');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Call the contractor today' })).toBeVisible();
  await page.getByRole('button', { name: 'Complete Call the contractor today' }).click();
  await expect(page.getByRole('heading', { name: 'Call the contractor today' })).toBeHidden();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Call the contractor today' })).toBeVisible();
});

test('shows nested subtasks in task details', async ({ page }) => {
  await signIn(page);
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill('Parent task');
  await form.getByRole('button', { name: 'Add task' }).click();
  await page.getByRole('button', { name: 'Parent task', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Edit task' })
    .getByRole('button', { name: 'Cancel' })
    .click();
  await form.getByLabel('Task label').fill('Child task');
  await expandTaskDetails(form);
  await form.getByRole('combobox', { name: 'Parent task' }).fill('Parent task');
  await page.getByRole('option', { name: 'Parent task', exact: true }).click();
  await form.getByRole('button', { name: 'Add task' }).click();
  await page.getByRole('button', { name: 'Parent task', exact: true }).click();
  await expect(
    page.getByLabel('Task details').getByRole('listitem').filter({ hasText: 'Child task' }),
  ).toBeVisible();
});

test('keeps Tasks first and collapses the mobile header after scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await signIn(page);
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation.getByRole('button').first()).toHaveText('Tasks');
  await expect(navigation.getByRole('button', { name: 'Tasks', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await page.evaluate(() => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 220 });
    window.dispatchEvent(new Event('scroll'));
  });
  await expect(page.locator('.topbar')).toHaveClass(/topbar-collapsed/);
  await expect(page.locator('.topbar > img')).toBeHidden();
  await expect(navigation).toBeVisible();
});
