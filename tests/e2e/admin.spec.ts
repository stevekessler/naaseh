import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('an administrator responsively lists, disables, and reactivates users without self-disablement', async ({
  page,
}) => {
  const users = [
    {
      id: 'admin',
      username: 'steve',
      displayName: 'Steve',
      role: 'admin',
      active: true,
      sessionEpoch: 1,
    },
    {
      id: 'user',
      username: 'alex',
      displayName: 'Alex',
      role: 'user',
      active: true,
      sessionEpoch: 2,
    },
  ];
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: users[0], csrfToken: 'test-csrf' }),
    }),
  );
  await page.route('**/api/v1/admin/users*', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as {
        username: string;
        displayName: string;
        role: 'user' | 'admin';
      };
      const created = {
        id: `created-${body.role}`,
        username: body.username,
        displayName: body.displayName,
        role: body.role,
        active: true,
        sessionEpoch: 0,
      };
      users.push(created);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          version: 'naaseh.provision-user-result/v1',
          created: true,
          user: created,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: users }),
    });
  });
  await page.route('**/api/v1/admin/users/user', async (route) => {
    const body = route.request().postDataJSON() as { active: boolean };
    const user = users[1]!;
    user.active = body.active;
    user.sessionEpoch += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(user),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Username').fill('steve');
  await page.getByLabel('Password').fill('local-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Admin' }).click();
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await expect(page.getByText(/Administration is online only/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Disable Steve' })).toBeDisabled();
  await page.getByLabel('Username').fill('new-admin');
  await page.getByLabel('Display name').fill('New Admin');
  await page.getByLabel('Role').selectOption('admin');
  await page.getByLabel('Password').fill('correct horse battery staple');
  await page.getByLabel('PIN').fill('246810');
  await page.getByRole('button', { name: 'Add user' }).click();
  await expect(page.getByRole('cell', { name: '@new-admin' })).toBeVisible();
  await page.getByRole('button', { name: 'Disable Alex' }).click();
  await expect(page.getByRole('row', { name: /Alex.*Disabled/ })).toBeVisible();
  await page.getByRole('button', { name: 'Reactivate Alex' }).click();
  await expect(page.getByRole('row', { name: /Alex.*Active/ })).toBeVisible();
});

test('a regular user has no administration surface and cannot see another user private data', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'user',
          username: 'alex',
          displayName: 'Alex',
          role: 'user',
          active: true,
          sessionEpoch: 0,
        },
        csrfToken: 'test-csrf',
      }),
    }),
  );
  await page.goto('/');
  await page.getByLabel('Username').fill('alex');
  await page.getByLabel('Password').fill('local-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Admin' })).toHaveCount(0);
  await expect(page.getByText('other-user-private-task')).toHaveCount(0);
});
