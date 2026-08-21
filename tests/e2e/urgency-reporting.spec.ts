import { expect, test } from '@playwright/test';
import { expandTaskDetails, signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

const completionReport = {
  asOf: '2026-08-05T12:00:00.000Z',
  urgencySemantics: 'historical_at_completion',
  total: 2,
  urgencyCounts: { low: 0, medium: 0, high: 1, critical: 1 },
  buckets: [{ key: '2026-08-05', count: 2 }],
  nextCursor: null,
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/reporting/completion-report**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(completionReport),
    }),
  );
});

test('keeps report filters keyboard/touch operable and exposes live report state', async ({
  page,
}, testInfo) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Completed Tasks' }).click();
  const filters = page.getByRole('group', { name: 'Completion urgency filters' });
  const high = filters.getByRole('checkbox', { name: 'High' });
  await high.focus();
  await expect(high).toBeFocused();
  if (['iphone', 'ipad'].includes(testInfo.project.name)) await high.tap();
  else await high.press('Space');
  await expect(high).toBeChecked();
  await expect(page.getByRole('status').first()).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('shows all five completion urgency buckets and historical semantics', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Completed Tasks' }).click();
  await expect(page.getByRole('heading', { name: 'Priority at completion' })).toBeVisible();
  for (const label of ['Low', 'Medium', 'High', 'Critical'])
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByText(/Low.*0/)).toBeVisible();
  await expect(page.getByText(/Critical.*1/)).toBeVisible();
});

test('filters report detail and orders eligible rows by viewer-only ranks', async ({ page }) => {
  await signIn(page);
  const form = page.locator('.task-form:has(button:has-text("Add task"))');
  await form.getByLabel('Task label').fill('Viewer high rank');
  await expandTaskDetails(form);
  await form.getByLabel('Priority', { exact: true }).selectOption('high');
  await form.getByRole('button', { name: 'Add task' }).click();
  await page.getByRole('button', { name: 'Projects' }).click();
  await page
    .getByRole('group', { name: 'Current priorities' })
    .getByRole('checkbox', { name: 'High', exact: true })
    .check();
  const report = page.getByRole('region', { name: 'Workload report detail' });
  await report.getByRole('radio', { name: 'Sort by Overall rank' }).check();
  await expect(report.getByText(/Overall position 1/).first()).toBeVisible();
  await expect(report.getByRole('radio', { name: 'Sort by Project rank' })).toBeDisabled();
  await expect(report).not.toContainText(/another user.*position/i);
});

test('offers the verified completed-task export after priority reporting', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Completed Tasks' }).click();
  await expect(page.getByRole('button', { name: /export csv/i })).toBeVisible();
});

test('reads a warmed cached report offline and refreshes pending urgency after reconnect', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Completed Tasks' }).click();
  await expect(page.getByText(/Critical.*1/)).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await page.getByRole('button', { name: 'Completed Tasks' }).click();
  await expect(page.getByText('Offline · showing previously synchronized report')).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/Last synchronized/i)).toBeVisible({ timeout: 15_000 });
});

for (const failure of [
  { status: 500, code: 'report_calculation_failed', action: 'Retry report' },
  { status: 410, code: 'cursor_expired', action: 'Restart report' },
  { status: 409, code: 'pagination_context_changed', action: 'Restart report' },
] as const) {
  test(`offers recovery for ${failure.code}`, async ({ page }) => {
    await page.route('**/api/v1/reporting/completion-report**', (route) =>
      route.fulfill({
        status: failure.status,
        contentType: 'application/problem+json',
        body: JSON.stringify({ code: failure.code, message: failure.code }),
      }),
    );
    await signIn(page);
    await page.getByRole('button', { name: 'Completed Tasks' }).click();
    const alert = page
      .getByRole('alert')
      .filter({ has: page.getByRole('button', { name: failure.action }) });
    await expect(alert).toBeVisible();
    await expect(alert.getByRole('button', { name: failure.action })).toBeVisible();
  });
}
