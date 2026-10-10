import { expect, test } from '@playwright/test';
import { expandTaskDetails, openTaskSection, setTaskDueDate, signIn } from './enhanced-helpers.js';

test('creates, edits, completes, and inspects a responsive task with revisions and reminders', async ({
  page,
}) => {
  await page.route('**/api/v1/users/directory', (route) =>
    route.fulfill({
      json: {
        items: [{ id: 'local-steve', displayName: 'Steve Kessler', username: 'local-steve' }],
      },
    }),
  );
  await signIn(page);
  await expect(page.getByRole('region', { name: 'Search and filters' })).toBeHidden();
  await page.getByRole('button', { name: 'Filtered tasks', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Search and filters' })).toBeVisible();
  await page.getByRole('button', { name: 'All tasks', exact: true }).click();
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill('Call the contractor');
  await expect(form.locator('.task-form-details')).not.toHaveAttribute('open', '');
  await expandTaskDetails(form);
  await form.getByLabel('Link', { exact: true }).fill('http://example.com/project');
  await form
    .getByRole('textbox', { name: 'Memo', exact: true })
    .fill('Ask for an updated estimate at https://memo.example/estimate');
  await setTaskDueDate(form, '2020-01-01', '09:00');
  await expect(form.getByLabel('Assignee')).toHaveValue('local-steve');
  await form.getByLabel('Private task').check();
  await form.getByRole('button', { name: 'Add task' }).click();
  const taskTable = page.getByRole('table', { name: 'Tasks' });
  await expect(taskTable).toBeVisible();
  await expect(taskTable.getByRole('columnheader', { name: 'Task' })).toBeVisible();
  if (test.info().project.name === 'iphone') {
    const header = await taskTable.locator('thead').boundingBox();
    expect(header?.width).toBeLessThanOrEqual(1);
    expect(header?.height).toBeLessThanOrEqual(1);
  } else await expect(taskTable.getByRole('columnheader', { name: 'Memo' })).toBeVisible();
  await expect(taskTable.getByRole('columnheader', { name: 'Due' })).toBeVisible();
  await expect(taskTable.getByRole('link', { name: /example.com\/project/ })).toHaveAttribute(
    'href',
    'http://example.com/project',
  );
  await expect(
    taskTable.getByRole('link', { name: 'https://memo.example/estimate' }),
  ).toHaveAttribute('href', 'https://memo.example/estimate');
  await expect(taskTable.getByRole('columnheader', { name: 'Priority' })).toBeVisible();
  await expect(taskTable.getByRole('columnheader', { name: 'Assignee' })).toBeVisible();
  await expect(taskTable.locator('.task-assignee-cell .user-first-name')).toHaveText('Steve');
  await expect(taskTable.locator('tbody .task-assignee-cell')).not.toContainText('Kessler');
  if (test.info().project.name === 'iphone') {
    await expect(taskTable.locator('thead')).toHaveCSS('position', 'absolute');
  } else await expect(taskTable.getByRole('columnheader', { name: 'Actions' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Call the contractor' })).toBeVisible();
  const dueFontSize = await taskTable
    .locator('.task-due-cell > span')
    .first()
    .evaluate((element) => getComputedStyle(element).fontSize);
  const taskFontSize = await taskTable
    .locator('.task-name-cell')
    .first()
    .evaluate((element) => getComputedStyle(element).fontSize);
  expect(dueFontSize).toBe(taskFontSize);
  await page.locator('.task-column-settings > summary').click();
  const columnSettings = page.getByRole('group', { name: 'Choose visible columns' });
  await expect(columnSettings).toBeVisible();
  const columnLabels = await columnSettings.locator('.task-column-options label').allTextContents();
  expect(columnLabels.slice(0, 2)).toEqual(['Category', 'Project']);
  await columnSettings.getByRole('button', { name: 'Close column settings' }).click();

  await taskTable
    .getByRole('button', { name: 'Call the contractor progress: 0% complete' })
    .click();
  const progress = taskTable.getByRole('dialog', { name: 'Adjust Call the contractor progress' });
  await expect(progress).toBeVisible();
  await progress.getByRole('slider').fill('50');
  await progress.getByRole('button', { name: 'Save' }).click();
  await expect(
    taskTable.getByRole('button', { name: 'Call the contractor progress: 50% complete' }),
  ).toBeVisible();

  await taskTable.getByRole('button', { name: 'Actions for Call the contractor' }).click();
  await expect(taskTable.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await page.getByText('1 task', { exact: true }).click();
  await expect(
    taskTable
      .getByRole('button', { name: 'Actions for Call the contractor' })
      .locator('xpath=parent::details'),
  ).not.toHaveAttribute('open', '');
  await expect(page.getByText('Overdue', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Call the contractor', exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\//);
  const detail = page.getByLabel('Task details');
  const dialog = page.getByRole('dialog', { name: 'Edit task' });
  await expect(dialog.getByLabel('Link', { exact: true })).toHaveValue(
    'http://example.com/project',
  );
  await expect(detail.getByRole('heading', { name: 'Revision history' })).toBeVisible();
  await expect(detail.getByText(/create by local-steve/)).toBeVisible();
  await dialog.getByLabel('Task label').fill('Call the contractor today');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Call the contractor today' })).toBeVisible();
  await page.getByRole('button', { name: 'Complete Call the contractor today' }).click();
  await expect(page.getByRole('heading', { name: 'Call the contractor today' })).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Undo completion of Call the contractor today' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo completion of Call the contractor today' }).click();
  await expect(page.getByRole('heading', { name: 'Call the contractor today' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Undo completion of Call the contractor today' }),
  ).toBeHidden();
  await page.getByRole('button', { name: 'Complete Call the contractor today' }).click();
  await openTaskSection(page, 'Archive');
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
  await expect(form.getByRole('combobox', { name: 'Parent task' })).toHaveAttribute(
    'placeholder',
    'Search parent tasks',
  );
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
  await expect(navigation.getByRole('button').first()).toContainText('Tasks');
  await navigation.getByRole('button', { name: 'Tasks', exact: true }).click();
  const taskMenu = page.locator('#tasks-navigation-links');
  const navigationLabels = await taskMenu.getByRole('button').allTextContents();
  expect(navigationLabels).toEqual(['My Tasks', 'Personal Stack', 'Task Reporting', 'Archive']);
  await navigation.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(navigation.getByRole('button', { name: 'Tasks', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const adminButton = navigation.getByRole('button', { name: 'Admin' });
  const assertAdminOnSameRow = async () => {
    await expect(navigation).toHaveCSS('flex-wrap', 'nowrap');
    await expect(adminButton).toBeAttached();
  };
  await assertAdminOnSameRow();

  await page.evaluate(() => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 220 });
    window.dispatchEvent(new Event('scroll'));
  });
  await expect(page.locator('.topbar')).toHaveClass(/topbar-collapsed/);
  await expect(page.locator('.topbar > img')).toBeHidden();
  await expect(navigation).toBeVisible();
  await assertAdminOnSameRow();
  await adminButton.click();
  const menu = page.locator('#admin-navigation-links');
  await expect(menu.getByRole('button', { name: 'Groups', exact: true })).toBeVisible();
  const menuBox = await menu.boundingBox();
  expect(menuBox!.x).toBeGreaterThanOrEqual(0);
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(390);
  await menu.getByRole('button', { name: 'Groups', exact: true }).click();
  await expect(menu).toHaveCount(0);
});
