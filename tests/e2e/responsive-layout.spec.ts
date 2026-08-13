import { expect, test } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';
import {
  expectContained,
  expectMinimumTarget,
  expectNoDocumentOverflow,
  expectNoIntersection,
} from './responsive-assertions.js';

for (const width of [320, 375, 390]) {
  test(`standard fields remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    await signIn(page);
    await expectNoDocumentOverflow(page);
    const form = page.locator('.task-form').first();
    const fields = form.locator('.form-grid > label');
    for (let index = 0; index < (await fields.count()) - 1; index += 1)
      await expectNoIntersection(fields.nth(index), fields.nth(index + 1));
    await expectContained(form.getByRole('button', { name: 'Add task' }), form);
    await expectMinimumTarget(form.getByRole('button', { name: 'Add task' }));

    await page.getByRole('button', { name: 'Completed Tasks' }).click();
    const filters = page.locator('.completion-filters');
    await expect(filters).toBeVisible();
    await expectNoDocumentOverflow(page);
    await expectContained(filters.getByLabel('Period'), filters);
  });
}
