import { expect, test } from '@playwright/test';

test('2D moon arcade boots and fills the playfield', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#game-button')).toBeVisible();
  await page.locator('#game-button').click();
  await expect(page.locator('#arcade-shell')).toBeVisible();
  await expect(page.locator('#arcade-player-gate')).toBeVisible();
  await page.locator('#arcade-nickname').selectOption({ label: '달토끼' });
  await page.locator('#arcade-start-run').click();
  await expect(page.locator('#arcade-player-gate')).toBeHidden({ timeout: 15_000 });
  await expect(page.locator('#arcade-target-name')).toHaveText('초승달');
  await expect(page.locator('#arcade-score-value')).toHaveText('0');
  await expect(page.locator('#arcade-hearts img')).toHaveCount(3);
  await expect(page.locator('#arcade-canvas canvas')).toBeVisible();
  await page.waitForTimeout(2_300);

  const canvasBox = await page.locator('#arcade-canvas canvas').boundingBox();
  expect(canvasBox?.width ?? 0).toBeGreaterThan(300);
  expect(canvasBox?.height ?? 0).toBeGreaterThan(300);
  await page.waitForFunction(() => {
    const debug = window.__MOON_ARCADE_DEBUG__;
    return Boolean(debug?.moons.some((moon) => moon.visible && moon.phase === debug.target));
  });
  const targetMoon = await page.evaluate(() => {
    const debug = window.__MOON_ARCADE_DEBUG__!;
    return debug.moons.find((moon) => moon.visible && moon.phase === debug.target)!;
  });
  await page.mouse.click((canvasBox?.x ?? 0) + targetMoon.x, (canvasBox?.y ?? 0) + targetMoon.y);
  await expect.poll(async () => Number((await page.locator('#arcade-score-value').textContent())?.replaceAll(',', '') ?? 0)).toBeGreaterThan(0);
  await testInfo.attach(`${testInfo.project.name}-moon-arcade`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
