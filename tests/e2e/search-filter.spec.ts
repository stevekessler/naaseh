import { expect, test, type Page } from '@playwright/test';
import { expandTaskDetails, setTaskDueDate } from './enhanced-helpers.js';

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Ready when you are/ })).toBeVisible();
}

async function addTask(
  page: Page,
  task: {
    label: string;
    memo?: string;
    dueDate?: string;
    dueTime?: string;
    assignee?: string;
    urgency?: string;
    category?: string;
    project?: string;
    progress?: number;
  },
) {
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill(task.label);
  if (task.dueDate) await setTaskDueDate(form, task.dueDate, task.dueTime);
  if (task.urgency) await form.getByLabel('Priority', { exact: true }).selectOption(task.urgency);
  if (task.category) await form.getByLabel('Category').selectOption({ label: task.category });
  if (task.project) await form.getByLabel('Project').selectOption({ label: task.project });
  if (task.memo || task.assignee || task.progress !== undefined) {
    await expandTaskDetails(form);
    if (task.memo) await form.getByRole('textbox', { name: 'Memo', exact: true }).fill(task.memo);
    if (task.assignee) await form.getByLabel('Assignee').selectOption(task.assignee);
    if (task.progress !== undefined)
      await form.getByRole('slider', { name: 'Progress' }).fill(String(task.progress));
  }
  await form.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByRole('heading', { name: task.label })).toBeVisible();
}

test('all task filters and date shortcuts narrow the rendered browser results', async ({
  page,
  context,
}) => {
  await page.route('**/api/v1/users/directory', (route) =>
    route.fulfill({
      json: {
        items: [
          { id: 'local-steve', displayName: 'Steve Kessler', username: 'steve' },
          { id: 'alex', displayName: 'Alex User', username: 'alex' },
        ],
      },
    }),
  );
  await signIn(page);

  await page.getByRole('button', { name: 'Admin', exact: true }).click();
  await page.getByRole('button', { name: 'Categories & Projects', exact: true }).click();
  const organization = page.getByRole('region', { name: 'Categories and Projects' });
  await organization.getByText('Add category', { exact: true }).click();
  const categoryForm = organization.locator('form').filter({ hasText: 'Save category' });
  await categoryForm.getByLabel('Name').fill('Client work');
  await categoryForm.getByLabel('Color').fill('#336699');
  await categoryForm.getByRole('button', { name: 'Save category' }).click();
  await categoryForm.getByLabel('Name').fill('Personal work');
  await categoryForm.getByLabel('Color').fill('#669933');
  await categoryForm.getByRole('button', { name: 'Save category' }).click();
  await organization.getByText('Add project', { exact: true }).click();
  const projectForm = organization.locator('form').filter({ hasText: 'Create Project' });
  await projectForm.getByLabel('Category').selectOption({ label: 'Client work' });
  await projectForm.getByLabel('Project name').fill('Cedar account');
  await projectForm.getByRole('button', { name: 'Create Project' }).click();
  await projectForm.getByLabel('Category').selectOption({ label: 'Personal work' });
  await projectForm.getByLabel('Project name').fill('Home account');
  await projectForm.getByRole('button', { name: 'Create Project' }).click();
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await page.getByRole('button', { name: 'My Tasks', exact: true }).click();

  const dates = await page.evaluate(() => {
    const key = (value: Date) => {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    const today = new Date();
    const tomorrow = new Date(today);
    const yesterday = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    yesterday.setDate(today.getDate() - 1);
    return { today: key(today), tomorrow: key(tomorrow), yesterday: key(yesterday) };
  });
  await addTask(page, {
    label: 'Project Cedar',
    memo: 'Request the roof estimate',
    dueDate: '2030-01-15',
    dueTime: '09:00',
    assignee: 'local-steve',
    urgency: 'high',
    category: 'Client work',
    project: 'Cedar account',
    progress: 50,
  });
  await addTask(page, {
    label: 'Grocery list',
    memo: 'Apples and oranges',
    dueDate: '2030-02-20',
    dueTime: '17:00',
    assignee: 'alex',
    urgency: 'low',
    category: 'Personal work',
    project: 'Home account',
  });
  await addTask(page, { label: 'Today only', dueDate: dates.today });
  await addTask(page, { label: 'Tomorrow only', dueDate: dates.tomorrow, assignee: 'alex' });
  await addTask(page, { label: 'Yesterday date only', dueDate: dates.yesterday });
  await expect(
    page.getByRole('row').filter({ hasText: 'Yesterday date only' }).getByText('Overdue'),
  ).toBeVisible();
  await addTask(page, { label: 'Archived sample' });
  await page.getByRole('button', { name: 'Complete Archived sample' }).click();

  const taskTable = page.getByRole('table', { name: 'Tasks' });
  const visibleTaskLabels = () => taskTable.locator('tbody .task-link').allTextContents();
  await taskTable.getByRole('button', { name: 'Sort by Due date ascending' }).click();
  await expect(taskTable.getByRole('columnheader', { name: /Due date/ })).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
  expect((await visibleTaskLabels())[0]).toBe('Yesterday date only');
  await taskTable.getByRole('button', { name: 'Sort by Due date descending' }).click();
  expect((await visibleTaskLabels())[0]).toBe('Grocery list');
  await taskTable.getByRole('button', { name: 'Sort by Category ascending' }).click();
  expect((await visibleTaskLabels()).slice(0, 2)).toEqual(['Project Cedar', 'Grocery list']);
  await taskTable.getByRole('button', { name: 'Sort by Category descending' }).click();
  expect((await visibleTaskLabels()).slice(0, 2)).toEqual(['Grocery list', 'Project Cedar']);
  await taskTable.getByRole('button', { name: 'Sort by Project ascending' }).click();
  expect((await visibleTaskLabels()).slice(0, 2)).toEqual(['Project Cedar', 'Grocery list']);
  await taskTable.getByRole('button', { name: 'Sort by Project descending' }).click();
  expect((await visibleTaskLabels()).slice(0, 2)).toEqual(['Grocery list', 'Project Cedar']);
  await taskTable.getByRole('button', { name: 'Sort by Priority ascending' }).click();
  expect((await visibleTaskLabels())[0]).toBe('Grocery list');
  await taskTable.getByRole('button', { name: 'Sort by Priority descending' }).click();
  expect((await visibleTaskLabels())[0]).toBe('Project Cedar');

  await page.getByRole('button', { name: 'Lists', exact: true }).click();
  const listForm = page.locator('form').filter({ has: page.getByLabel('List name') });
  await listForm.getByLabel('List name').fill('Filter checklist');
  await listForm.getByLabel('Category').selectOption({ label: 'Client work' });
  await listForm.getByRole('button', { name: 'Create list' }).click();
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await page.getByRole('button', { name: 'My Tasks', exact: true }).click();

  await page.getByRole('button', { name: 'Filtered tasks', exact: true }).click();
  const filters = page.getByRole('region', { name: 'Search and filters' });
  await filters.getByLabel('Search').fill('estim');
  await expect(filters.getByRole('status')).toHaveText('1 result');
  await expect(page.getByRole('heading', { name: 'Project Cedar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Grocery list' })).toBeHidden();
  await expect(page).not.toHaveURL(/estim|roof/i);
  await page.getByRole('button', { name: 'All tasks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Grocery list' })).toBeVisible();
  await page.getByRole('button', { name: 'Filtered tasks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Grocery list' })).toBeHidden();

  await filters.getByRole('button', { name: 'Clear filters' }).click();
  await filters.getByRole('textbox', { name: 'From' }).fill('2030-01-01');
  await filters.getByRole('textbox', { name: 'To', exact: true }).fill('2030-01-31');
  await filters.getByLabel('Assignee').selectOption('local-steve');
  await expect(filters.getByRole('status')).toHaveText('1 result');
  await expect(page.getByRole('heading', { name: 'Project Cedar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Grocery list' })).toBeHidden();
  await expect(page).toHaveURL(/from=2030-01-01/);
  await expect(page).toHaveURL(/assigneeId=local-steve/);

  await context.setOffline(true);
  await filters.getByLabel('Search').fill('ced');
  await expect(filters.getByRole('status')).toHaveText('1 result');
  await expect(page.getByRole('heading', { name: 'Project Cedar' })).toBeVisible();
  await expect(page).not.toHaveURL(/ced/i);
  await context.setOffline(false);

  await filters.getByRole('button', { name: 'Clear filters' }).click();
  await filters.getByLabel('High').check();
  await expect(page.getByRole('heading', { name: 'Project Cedar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Grocery list' })).toBeHidden();
  await filters.getByRole('button', { name: 'Clear urgency filters' }).click();

  await filters.getByLabel('Project').selectOption({ label: 'Cedar account' });
  await expect(page.getByRole('heading', { name: 'Project Cedar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today only' })).toBeHidden();
  await filters.getByRole('button', { name: 'Remove projectId filter' }).click();

  await filters.getByLabel('Category').selectOption({ label: 'Client work' });
  await expect(page.getByRole('heading', { name: 'Project Cedar' })).toBeVisible();
  await filters.getByRole('button', { name: 'Remove categoryId filter' }).click();

  await filters.getByLabel('Progress').selectOption('in-progress');
  await expect(page.getByRole('heading', { name: 'Project Cedar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Grocery list' })).toBeHidden();
  await filters.getByRole('button', { name: 'Clear filters' }).click();

  await filters.getByLabel('Assignee').selectOption('alex');
  await expect(page.getByRole('heading', { name: 'Grocery list' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Project Cedar' })).toBeHidden();
  await filters.getByRole('button', { name: 'Clear filters' }).click();

  await filters.getByRole('button', { name: 'Today' }).click();
  await expect(filters.getByRole('textbox', { name: 'From' })).toHaveValue(dates.today);
  await expect(filters.getByRole('textbox', { name: 'To', exact: true })).toHaveValue(dates.today);
  await expect(page.getByRole('heading', { name: 'Today only' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tomorrow only' })).toBeHidden();
  await filters.getByRole('button', { name: 'Tomorrow' }).click();
  await expect(page.getByRole('heading', { name: 'Tomorrow only' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today only' })).toBeHidden();
  await filters.getByRole('button', { name: 'This week' }).click();
  await expect(filters.getByRole('textbox', { name: 'From' })).not.toHaveValue('');
  await expect(filters.getByRole('textbox', { name: 'To', exact: true })).not.toHaveValue('');
  await filters.getByRole('button', { name: 'This month' }).click();
  await expect(page.getByRole('heading', { name: 'Today only' })).toBeVisible();
  await filters.getByRole('button', { name: 'Clear filters' }).click();

  await filters.getByLabel('Content').selectOption('lists');
  await expect(page.getByRole('button', { name: 'Filter checklist' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Project Cedar' })).toBeHidden();
  await filters.getByRole('button', { name: 'Clear filters' }).click();

  await filters.getByLabel('Scope').selectOption('archive');
  await expect(page.getByRole('heading', { name: 'Archived sample' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Project Cedar' })).toBeHidden();
});
