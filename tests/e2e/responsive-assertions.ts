import { expect, type Locator, type Page } from '@playwright/test';

export async function expectNoDocumentOverflow(page: Page, tolerance = 2) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(tolerance);
}

export async function expectContained(child: Locator, container: Locator) {
  const [childBox, containerBox] = await Promise.all([
    child.boundingBox(),
    container.boundingBox(),
  ]);
  expect(childBox, 'child is visible').not.toBeNull();
  expect(containerBox, 'container is visible').not.toBeNull();
  if (!childBox || !containerBox) return;
  expect(childBox.x).toBeGreaterThanOrEqual(containerBox.x - 1);
  expect(childBox.y).toBeGreaterThanOrEqual(containerBox.y - 1);
  expect(childBox.x + childBox.width).toBeLessThanOrEqual(containerBox.x + containerBox.width + 1);
  expect(childBox.y + childBox.height).toBeLessThanOrEqual(
    containerBox.y + containerBox.height + 1,
  );
}

export async function expectNoIntersection(first: Locator, second: Locator) {
  const [a, b] = await Promise.all([first.boundingBox(), second.boundingBox()]);
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  if (!a || !b) return;
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  expect(width > 0 && height > 0).toBe(false);
}

export async function expectVerticalGap(above: Locator, below: Locator, minimum = 8) {
  const [aboveBox, belowBox] = await Promise.all([above.boundingBox(), below.boundingBox()]);
  expect(aboveBox).not.toBeNull();
  expect(belowBox).not.toBeNull();
  if (!aboveBox || !belowBox) return;
  expect(belowBox.y - (aboveBox.y + aboveBox.height)).toBeGreaterThanOrEqual(minimum);
}

export async function expectMinimumTarget(target: Locator, minimum = 44) {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.width).toBeGreaterThanOrEqual(minimum);
  expect(box.height).toBeGreaterThanOrEqual(minimum);
}

export async function expectFocusNotClipped(target: Locator) {
  await target.focus();
  await expect(target).toBeFocused();
  await expectContained(target, target.page().locator('body'));
}

export async function expectReachableInUsableViewport(target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  const viewport = target.page().viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (!box || !viewport) return;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}
