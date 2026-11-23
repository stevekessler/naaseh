import { expect, test } from '@playwright/test';
import {
  financeSnapshotFixtureHeaders,
  mockFinanceSnapshotEvidence,
  mockSuccessfulSync,
  mockUnprotectedFinanceSecurity,
  signIn,
} from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block', timezoneId: 'America/Denver' });

const budgetId = '01J00000000000000000000092';
const budget = {
  id: budgetId,
  name: 'Household budget',
  groupId: '01J00000000000000000000095',
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  budgetDate: '2026-11-01',
  items: [],
  totals: [],
  totalsComplete: true,
  status: 'active',
  activity: 'active',
  version: 1,
};

test('shows forecasts for opted-in budgets and requires explicit expanded history on the detail', async ({
  page,
}) => {
  await mockUnprotectedFinanceSecurity(page, { role: 'user' });
  await mockSuccessfulSync(page);
  await mockFinanceSnapshotEvidence(page, { allowProoflessPull: true });
  await page.route(
    /\/api\/v1\/finance\/(?:accounts|categories|upcoming-expenses)(?:\?|$)/u,
    (route) => route.fulfill({ headers: financeSnapshotFixtureHeaders, json: { items: [] } }),
  );
  await page.route('**/api/v1/groups', (route) => route.fulfill({ json: { items: [] } }));
  await page.route('**/api/v1/finance/budgets', (route) =>
    route.fulfill({ headers: financeSnapshotFixtureHeaders, json: { items: [budget] } }),
  );
  await page.route('**/api/v1/finance/budgets/' + budgetId, (route) =>
    route.fulfill({ headers: financeSnapshotFixtureHeaders, json: budget }),
  );
  await page.route('**/api/v1/finance/dashboard-preferences', (route) =>
    route.fulfill({
      json: {
        flags: [{ targetKind: 'budget', targetId: budgetId, included: true, version: 1 }],
        settings: { upcomingCount: 10, version: 0 },
      },
    }),
  );
  await page.route('**/api/v1/finance/dashboard/budgets/' + budgetId, (route) =>
    route.fulfill({
      json: {
        id: budgetId,
        name: budget.name,
        startDate: budget.startDate,
        endDate: budget.endDate,
        items: [],
        accountIds: [],
        complete: true,
      },
    }),
  );
  const requests: boolean[] = [];
  await page.route('**/api/v1/finance/budgets/' + budgetId + '/forecast', (route) => {
    const body = route.request().postDataJSON() as {
      method: 'known-plan' | 'historical';
      includeNonBudgetedHistory: boolean;
      timeZone: string;
    };
    requests.push(body.includeNonBudgetedHistory);
    return route.fulfill({
      json: {
        ...body,
        budgetId,
        asOfDate: '2026-11-22',
        sourceAsOf: '2026-11-22T12:00:00.000Z',
        sourceRevision: 'fixture-revision',
        window: { dateFrom: budget.startDate, dateTo: budget.endDate, basis: 'budget' },
        coverage: body.method === 'historical' ? 'partial' : 'complete',
        status: body.method === 'historical' ? 'insufficient-history' : 'ready',
        ...(body.method === 'historical'
          ? { observed: { dateFrom: '2026-05-01', dateTo: '2026-10-31', coveredMonths: 1 } }
          : {}),
        currencies: [],
      },
    });
  });

  await signIn(page);
  await page.goto('/finance');
  await page.getByText('Forecast for Household budget').click();
  const forecast = page.getByRole('region', { name: 'Budget forecast', exact: true });
  await expect(forecast.getByRole('checkbox')).toHaveCount(0);
  await forecast.getByRole('button', { name: 'Run forecast' }).click();
  await expect(forecast.getByRole('heading', { name: 'Known-plan forecast' })).toBeVisible();
  await page.getByRole('button', { name: 'Open budget' }).click();
  await forecast.getByLabel('Forecast method').selectOption('historical');
  const optIn = forecast.getByRole('checkbox', { name: /Include non-budgeted history/ });
  await expect(optIn).not.toBeChecked();
  await optIn.check();
  expect(requests).toEqual([false]);
  await forecast.getByRole('button', { name: 'Run forecast' }).click();
  await expect(forecast.getByText(/Insufficient history/)).toBeVisible();
  expect(requests).toEqual([false, true]);
  await page.context().setOffline(true);
  await expect(forecast.getByText(/Reconnect to run a forecast/)).toBeVisible();
  await expect(forecast.getByText(/Insufficient history/)).toHaveCount(0);
});
