import { expect, test } from '@playwright/test';
import { signIn, expandTaskDetails, addTask } from './enhanced-helpers.js';
import { expectNoDocumentOverflow } from './responsive-assertions.js';
test.use({ serviceWorkers: 'block' });
test('ordinary users see identity, all assignees, compact priorities, and consistently spaced buttons', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      json: { user: { id: 'alex', displayName: 'Alex', role: 'user' }, csrfToken: 'csrf' },
    }),
  );
  await page.route('**/api/v1/users/directory', (route) =>
    route.fulfill({
      json: {
        items: [
          { id: 'alex', displayName: 'Alex', username: 'alex' },
          { id: 'steve', displayName: 'Steve', username: 'steve' },
        ],
      },
    }),
  );
  await signIn(page);
  await expect(page.getByRole('button', { name: 'Signed in as Alex. Open profile' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Admin', exact: true })).toHaveCount(0);
  const form = page.locator('.task-form').first();
  await expandTaskDetails(form);
  await expect(form.getByRole('option', { name: 'Steve (@steve)', exact: true })).toHaveCount(1);
  await form.getByRole('combobox', { name: 'Assignee', exact: true }).selectOption('steve');
  await expect(form.locator('#task-privacy-help')).toContainText('administrators');
  const toolbarGap = await form
    .locator('.memo-toolbar')
    .evaluate((element) => getComputedStyle(element).gap);
  const navGap = await page
    .locator('.topbar nav')
    .evaluate((element) => getComputedStyle(element).gap);
  expect(toolbarGap).toBe('8px');
  expect(navGap).toBe(toolbarGap);
  await addTask(page, 'Shared design review');
  await page.setViewportSize({ width: 375, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('.urgency-badge--responsive .priority-icon').first()).toBeVisible();
  await expect(page.locator('.urgency-badge--responsive .priority-text').first()).toBeHidden();
  await expectNoDocumentOverflow(page);
  await page.screenshot({ path: 'test-results/profile-identity-mobile.png', fullPage: true });
});
