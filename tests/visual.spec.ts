import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

async function expectCanvasVaried(page: import('@playwright/test').Page): Promise<void> {
  const canvas = page.locator('#game-canvas');
  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(300);
  expect(box?.height ?? 0).toBeGreaterThan(300);
  const png = PNG.sync.read(await canvas.screenshot());
  let min = 255;
  let max = 0;
  const buckets = new Set<string>();
  const stride = Math.max(1, Math.floor((png.width * png.height) / 4096));
  for (let pixel = 0; pixel < png.width * png.height; pixel += stride) {
    const offset = pixel * 4;
    const r = png.data[offset];
    const g = png.data[offset + 1];
    const b = png.data[offset + 2];
    min = Math.min(min, r, g, b);
    max = Math.max(max, r, g, b);
    buckets.add(`${r >> 4},${g >> 4},${b >> 4}`);
  }
  expect(max - min).toBeGreaterThan(20);
  expect(buckets.size).toBeGreaterThan(5);
}

test('typing intro leads into a continuous moon observation', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);
  await expect(page.locator('#dialogue-text')).not.toHaveText('');
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setReducedMotion(true));
  await expect(page.locator('#start-button')).toBeEnabled();
  await expectCanvasVaried(page);

  await page.locator('#start-button').click();
  await expect(page.locator('#date-label')).toContainText('음력');
  await page.evaluate(() => {
    window.__THREE_GAME_TEST_HOOKS__?.setPausedForScreenshot(true);
    window.__THREE_GAME_TEST_HOOKS__?.setTime(7.7917);
  });
  await expect(page.locator('#date-label')).toHaveText('음력 8일');
  await expect(page.locator('#phase-label')).toHaveText('상현달');

  const before = await page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.elapsedDays ?? 0);
  await page.locator('#time-slider').evaluate((element: HTMLInputElement) => {
    element.value = '14.5';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect.poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.elapsedDays ?? 0)).toBeGreaterThan(before + 5);

  await page.locator('#view-button').click();
  await page.locator('#skip-journey').click();
  await expect(page.locator('#split-labels')).toBeVisible();
  await expect(page.locator('#guide-note')).toBeVisible();
  await expectCanvasVaried(page);

  await testInfo.attach(`${testInfo.project.name}-moon-lab`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
