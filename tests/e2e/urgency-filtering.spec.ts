import { expect, test, type Page, type Route } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

const ids = {
  project: '01K00000000000000000000010',
  first: '01K00000000000000000000100',
  second: '01K00000000000000000000101',
} as const;

test.beforeEach(async ({ page }) => {
  void page;
});

const filtersFor = (page: Page) => page.getByRole('region', { name: 'Search and filters' });
const urgencyFiltersFor = (page: Page) => filtersFor(page).getByRole('group', { name: 'Urgency' });

async function createOrganization(page: Page) {
  await page.getByRole('button', { name: 'Admin' }).click();
  const organization = page.getByRole('region', { name: 'Categories and Projects' });
  const categoryForm = organization.locator('form').filter({ hasText: 'Save category' });
  await categoryForm.getByLabel('Name').fill('Urgency E2E Category');
  await categoryForm.getByLabel('Color').fill('#336699');
  await categoryForm.getByRole('button', { name: 'Save category' }).click();

  const projectForm = organization.locator('form').filter({ hasText: 'Create Project' });
  const categoryOption = projectForm.getByRole('option', { name: 'Urgency E2E Category' });
  const categoryId = await categoryOption.getAttribute('value');
  expect(categoryId).toBeTruthy();
  await projectForm.getByLabel('Category').selectOption(categoryId!);
  await projectForm.getByLabel('Project name').fill('Urgency E2E Project');
  await projectForm.getByRole('button', { name: 'Create Project' }).click();

  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  const projectOption = page
    .locator('.task-form')
    .first()
    .getByRole('option', { name: 'Urgency E2E Project' });
  const projectId = await projectOption.getAttribute('value');
  expect(projectId).toBeTruthy();
  return { categoryId: categoryId!, projectId: projectId! };
}

async function createFilteredTask(
  page: Page,
  input: { label: string; urgency: string; projectId: string; assignee: string; dueAt: string },
) {
  const form = page.locator('.task-form').first();
  await form.getByLabel('Task label').fill(input.label);
  await form.getByLabel('Memo').fill(`searchable ${input.label}`);
  await form.getByLabel('Urgency', { exact: true }).selectOption(input.urgency);
  await form.getByLabel('Project').selectOption(input.projectId);
  await form.getByLabel('Assignee').fill(input.assignee);
  await form.getByLabel('Due date and time').fill(input.dueAt);
  await form.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByRole('heading', { name: input.label })).toBeVisible();
}

async function selectUrgencies(page: Page, labels: string[]) {
  const group = urgencyFiltersFor(page);
  for (const label of labels) await group.getByRole('checkbox', { name: label }).check();
}

test('filters by one or many urgency levels with every existing filter online', async ({
  page,
}) => {
  await signIn(page);
  const organization = await createOrganization(page);
  await createFilteredTask(page, {
    label: 'Urgency filter critical target',
    urgency: 'critical',
    projectId: organization.projectId,
    assignee: 'steve',
    dueAt: '2030-01-15T09:00',
  });
  await createFilteredTask(page, {
    label: 'Urgency filter extra-low target',
    urgency: 'extra_low',
    projectId: organization.projectId,
    assignee: 'steve',
    dueAt: '2030-01-16T09:00',
  });
  await createFilteredTask(page, {
    label: 'Urgency filter excluded task',
    urgency: 'medium',
    projectId: organization.projectId,
    assignee: 'alex',
    dueAt: '2031-02-20T09:00',
  });

  await selectUrgencies(page, ['Critical']);
  await expect(page.getByRole('heading', { name: 'Urgency filter critical target' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Urgency filter extra-low target' })).toBeHidden();
  await selectUrgencies(page, ['Extra Low']);

  const filters = filtersFor(page);
  await filters.getByLabel('Search').fill('searchable urgency filter');
  await filters.getByRole('textbox', { name: 'From' }).fill('2030-01-01');
  await filters.getByRole('textbox', { name: 'To', exact: true }).fill('2030-01-31');
  await filters.getByLabel('Assignee').fill('steve');
  await filters.getByLabel('Category').fill(organization.categoryId);
  await filters.getByLabel('Project').fill(organization.projectId);
  await filters.getByLabel('Scope').selectOption('active');
  await filters.getByLabel('Content').selectOption('todos');
  await expect(filters.getByRole('status')).toHaveText('2 results');
  await expect(page).toHaveURL(/urgenc(?:y|ies)=/);

  await filters.getByLabel('Content').selectOption('lists');
  await expect(filters.getByRole('status')).toHaveText('0 results');
  await filters.getByLabel('Content').selectOption('all');
  await filters.getByLabel('Scope').selectOption('archive');
  await expect(filters.getByRole('status')).toHaveText('0 results');
});

test('preserves overall and Project stack order and archive filtering from a warmed offline cache', async ({
  page,
  context,
}) => {
  await signIn(page);
  const organization = await createOrganization(page);
  await createFilteredTask(page, {
    label: 'Offline critical stack item',
    urgency: 'critical',
    projectId: organization.projectId,
    assignee: 'steve',
    dueAt: '2030-01-15T09:00',
  });
  await createFilteredTask(page, {
    label: 'Offline low stack item',
    urgency: 'low',
    projectId: organization.projectId,
    assignee: 'steve',
    dueAt: '2030-01-16T09:00',
  });

  await page.getByRole('button', { name: 'Personal Stack' }).click();
  await expect(page.getByRole('heading', { name: 'Personal Stack' })).toBeVisible();
  await page.getByLabel('Stack scope').selectOption('overall');
  const before = await page.locator('.stack-row h2').allTextContents();
  await page.getByLabel('Stack scope').selectOption(`project:${organization.projectId}`);
  await expect(page.locator('.stack-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Archive' })).toBeVisible();

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Personal Stack' }).click();
  await page.getByLabel('Stack scope').selectOption('overall');
  await selectUrgencies(page, ['Critical', 'Low']);
  await expect(page.locator('.stack-row h2')).toHaveText(before);
  await page.getByLabel('Stack scope').selectOption(`project:${organization.projectId}`);
  await expect(page.locator('.stack-row h2')).toHaveText(before);

  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await selectUrgencies(page, ['Critical']);
  await expect(page.getByRole('status')).toContainText(/archived work|result/i);
  await context.setOffline(false);
});

function stackItem(id: string, label: string, overallPosition: number) {
  return {
    work: {
      id,
      workType: 'task',
      label,
      urgency: 'critical',
      lifecycle: 'active',
      version: 1,
      membershipEpoch: `epoch-${id}`,
    },
    rank: { overallPosition },
  };
}

const isUrgencyFiltered = (url: string) =>
  [...new URL(url).searchParams.keys()].some((key) => key === 'urgency' || key === 'urgencies');

const emptyStackPage = {
  scope: 'overall',
  version: 4,
  snapshotThroughVersion: 3,
  asOf: '2026-08-05T12:00:00.000Z',
  items: [],
  nextCursor: null,
};

test('continues through authorized short and empty filtered pages without skipping matches', async ({
  page,
}) => {
  await signIn(page);
  const cursors: Array<string | null> = [];
  await page.route('**/api/v1/stacks/overall**', async (route) => {
    if (!isUrgencyFiltered(route.request().url())) {
      await route.fulfill({ status: 200, json: emptyStackPage });
      return;
    }
    const cursor = new URL(route.request().url()).searchParams.get('cursor');
    cursors.push(cursor);
    const body =
      cursor === null
        ? { items: [stackItem(ids.first, 'First sparse match', 1)], nextCursor: 'short-page' }
        : cursor === 'short-page'
          ? { items: [], nextCursor: 'empty-page' }
          : { items: [stackItem(ids.second, 'Match after empty page', 2)], nextCursor: null };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        scope: 'overall',
        version: 4,
        snapshotThroughVersion: 3,
        asOf: '2026-08-05T12:00:00.000Z',
        ...body,
      }),
    });
  });

  await page.getByRole('button', { name: 'Personal Stack' }).click();
  await selectUrgencies(page, ['Critical']);
  await expect(page.getByRole('heading', { name: 'First sparse match' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Match after empty page' })).toBeVisible();
  await expect.poll(() => cursors).toEqual([null, 'short-page', 'empty-page']);
});

const readFailures = [
  {
    name: 'invalid cursor',
    status: 400,
    code: 'invalid_cursor',
    message: /invalid.*cursor/i,
    action: /restart/i,
  },
  {
    name: 'expired cursor',
    status: 410,
    code: 'cursor_expired',
    message: /expired/i,
    action: /restart/i,
  },
  {
    name: 'stale access or source context',
    status: 409,
    code: 'pagination_context_changed',
    message: /changed|stale/i,
    action: /restart/i,
  },
  {
    name: 'failed filtered read',
    status: 503,
    code: 'filtered_read_failed',
    message: /unable|failed/i,
    action: /retry/i,
  },
] as const;

for (const failure of readFailures) {
  test(`offers an actionable ${failure.action.source} for ${failure.name}`, async ({ page }) => {
    await signIn(page);
    await page.route('**/api/v1/stacks/overall**', (route) =>
      isUrgencyFiltered(route.request().url())
        ? route.fulfill({
            status: failure.status,
            contentType: 'application/problem+json',
            body: JSON.stringify({
              code: failure.code,
              message: `${failure.name}; restart or retry the filtered read.`,
              correlationId: `e2e-${failure.code}`,
            }),
          })
        : route.fulfill({ status: 200, json: emptyStackPage }),
    );
    await page.getByRole('button', { name: 'Personal Stack' }).click();
    await selectUrgencies(page, ['High']);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(failure.message);
    await expect(alert.getByRole('button', { name: failure.action })).toBeVisible();
  });
}

test('offers a retry when a filtered read times out', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/v1/stacks/overall**', (route: Route) =>
    isUrgencyFiltered(route.request().url())
      ? route.abort('timedout')
      : route.fulfill({ status: 200, json: emptyStackPage }),
  );
  await page.getByRole('button', { name: 'Personal Stack' }).click();
  await selectUrgencies(page, ['Medium']);
  const alert = page.getByRole('alert');
  await expect(alert).toContainText(/timed out|timeout/i);
  await expect(alert.getByRole('button', { name: /retry/i })).toBeVisible();
});

test('announces urgency filter results and supports keyboard or touch without overflow', async ({
  page,
}, testInfo) => {
  await signIn(page);
  const critical = urgencyFiltersFor(page).getByRole('checkbox', { name: 'Critical' });
  await critical.focus();
  await expect(critical).toBeFocused();
  if (['iphone', 'ipad'].includes(testInfo.project.name)) await critical.tap();
  else await critical.press('Space');
  await expect(critical).toBeChecked();
  await expect(filtersFor(page).getByRole('status').first()).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
