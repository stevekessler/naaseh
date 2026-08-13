import { expect, test } from '@playwright/test';
import { signIn } from './enhanced-helpers.js';
import { expectContained, expectNoDocumentOverflow } from './responsive-assertions.js';

for (const width of [768, 1024, 1280, 1440]) {
  test(`content and fields remain bounded at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page);
    const main = page.getByRole('main');
    await expectNoDocumentOverflow(page);
    await expectContained(page.locator('.task-form').first(), main);
    const mainBox = await main.boundingBox();
    expect(mainBox?.width).toBeLessThanOrEqual(1120);
    await page.getByRole('button', { name: 'Completed Tasks' }).click();
    const filters = page.locator('.completion-filters');
    await expectContained(filters, filters.locator('xpath=ancestor::main'));
  });
}
