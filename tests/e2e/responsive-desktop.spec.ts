import { expect, test } from '@playwright/test';
import { openTaskSection, signIn } from './enhanced-helpers.js';
import { expectContained, expectNoDocumentOverflow } from './responsive-assertions.js';

for (const width of [768, 1024, 1440, 1920]) {
  test(`content and fields remain bounded at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page);
    const main = page.getByRole('main');
    const taskForm = page.locator('.task-form').first();
    await taskForm.getByLabel('Task label').fill(`Desktop width ${width}`);
    await taskForm.getByRole('button', { name: 'Add task' }).click();
    await expectNoDocumentOverflow(page);
    await expectContained(taskForm, main);
    const mainBox = await main.boundingBox();
    if (width > 1460) expect(mainBox?.width).toBeCloseTo(width * 0.92, 0);
    else expect(mainBox?.width).toBeLessThanOrEqual(1344);
    const [tableWidth, tableWrapWidth] = await Promise.all([
      page.locator('.task-list').evaluate((element) => element.getBoundingClientRect().width),
      page.locator('.task-table-wrap').evaluate((element) => element.clientWidth),
    ]);
    expect(tableWidth).toBeCloseTo(tableWrapWidth, 0);
    await openTaskSection(page, 'Completed Tasks');
    const filters = page.locator('.completion-filters');
    await expectContained(filters, filters.locator('xpath=ancestor::main'));
  });
}
