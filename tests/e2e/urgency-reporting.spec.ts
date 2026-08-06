import { expect, test } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });

const completionReport = {
  asOf: '2026-08-05T12:00:00.000Z',
  urgencySemantics: 'historical_at_completion',
  total: 2,
  urgencyCounts: { extra_low: 0, low: 0, medium: 0, high: 1, critical: 1 },
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
  await page.getByRole('button', { name: 'Dashboard' }).click();
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
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await expect(page.getByRole('heading', { name: 'Urgency at completion' })).toBeVisible();
  for (const label of ['Extra Low', 'Low', 'Medium', 'High', 'Critical'])
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByText(/Extra Low.*0/)).toBeVisible();
  await expect(page.getByText(/Critical.*1/)).toBeVisible();
});

test('filters report detail and orders eligible rows by viewer-only ranks', async ({ page }) => {
  await signIn(page);
  const form = page.locator('.task-form').first();
  for (const [label, urgency] of [
    ['Viewer high rank', 'high'],
    ['Viewer low rank', 'low'],
  ] as const) {
    await form.getByLabel('Task label').fill(label);
    await form.getByLabel('Urgency', { exact: true }).selectOption(urgency);
    await form.getByRole('button', { name: 'Add task' }).click();
  }
  await page.getByRole('button', { name: 'Projects' }).click();
  await page
    .getByRole('group', { name: 'Current urgency filters' })
    .getByRole('checkbox', { name: 'High', exact: true })
    .check();
  const report = page.getByRole('region', { name: 'Workload report detail' });
  await report.getByRole('radio', { name: 'Sort by Overall rank' }).check();
  await expect(report.getByText(/Overall position 1/).first()).toBeVisible();
  await expect(report.getByRole('radio', { name: 'Sort by Project rank' })).toBeDisabled();
  await expect(report).not.toContainText(/another user.*position/i);
});

test('exports urgency and current viewer ranks while archived ranks remain blank', async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Dashboard' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /export csv/i }).click();
  const csv = await (await download).createReadStream();
  let contents = '';
  for await (const chunk of csv) contents += chunk.toString();
  expect(contents.split(/\r?\n/, 1)[0]).toContain('urgency,overallRank,projectRank');
  expect(contents).not.toMatch(/archived[^\n]*,[1-9]\d*,[1-9]\d*/i);
});

test('reads a warmed cached report offline and refreshes pending urgency after reconnect', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await expect(page.getByText(/Critical.*1/)).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await expect(page.getByText('Offline · showing previously synchronized report')).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/Last synchronized/i)).toBeVisible({ timeout: 15_000 });
});

for (const failure of [
  { status: 500, code: 'report_calculation_failed', action: /retry/i },
  { status: 410, code: 'cursor_expired', action: /restart/i },
  { status: 409, code: 'pagination_context_changed', action: /restart/i },
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
    await page.getByRole('button', { name: 'Dashboard' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert.getByRole('button', { name: failure.action })).toBeVisible();
  });
}
