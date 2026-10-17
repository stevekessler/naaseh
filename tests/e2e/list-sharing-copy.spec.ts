import { expect, test } from '@playwright/test';
import { createListWithItem, openNamedList, signIn } from './enhanced-helpers.js';

test.use({ serviceWorkers: 'block' });
test('@enhanced-lists lock precedence, deep links, copy readiness, and responsive controls', async ({
  page,
}) => {
  await page.route(/\/api\/v1\/lists\/[^/]+\/copies$/, async (route) =>
    route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ destinationListId: '01J00000000000000000000009' }),
    }),
  );
  await signIn(page);
  const list = await createListWithItem(page, 'Shared packing', 'Passports');
  await list.getByLabel('Lock list').click();
  await expect(list.getByText('Only you can see this list.')).toBeVisible();
  await expect(list.getByLabel('Share with group')).toHaveCount(0);
  await expect(list.getByText('Draft sharing changes.')).toBeVisible();
  await list.getByRole('button', { name: 'Save sharing' }).click();
  await expect(list.getByText(/Sharing saved|Pending synchronization/)).toBeVisible();
  await list.getByRole('button', { name: 'Copy list' }).click();
  await expect(list.getByText('The copied list is ready.')).toBeVisible();
  await openNamedList(page, 'Shared packing');
  await expect(page).toHaveURL(/\/lists\//);
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
});
