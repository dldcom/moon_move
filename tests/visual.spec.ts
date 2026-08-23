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

test('guided intro leads into a continuous moon observation', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await page.waitForFunction(() => (window.__THREE_GAME_DIAGNOSTICS__?.frame ?? 0) > 10);
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setReducedMotion(true));
  await expect(page.locator('#start-button')).toBeEnabled();
  await expect(page.locator('#game-button')).toBeVisible();
  await expect(page.locator('#intro-title')).toHaveCSS('white-space', 'nowrap');
  await expectCanvasVaried(page);

  await page.locator('#start-button').click();
  await expect(page.locator('#learning-guide')).toBeVisible();
  await expect(page.locator('#learning-guide-title')).toHaveText('달의 모양이 어떻게 변하는지 관찰해 보자!');
  await page.locator('#learning-guide-confirm').evaluate((button: HTMLButtonElement) => {
    button.click();
    window.__THREE_GAME_TEST_HOOKS__?.setPausedForScreenshot(true);
  });
  await expect(page.locator('#learning-guide')).toBeHidden();
  await expect(page.locator('#date-label')).toHaveText('음력 4일');
  await expect(page.locator('#time-label')).toHaveText(/오전 6:0[0-1]/);
  await expect(page.locator('.phase-marker')).toHaveCount(5);
  const phaseGuideImages = [
    'waxing-crescent.webp', 'first-quarter.webp', 'full-moon.webp',
    'last-quarter.webp', 'waning-crescent.webp',
  ];
  const namedPhasePositions: number[] = [];
  for (let index = 0; index < 5; index += 1) {
    await page.locator('.phase-marker').nth(index).click();
    await expect(page.locator('#learning-guide')).toBeVisible();
    await expect(page.locator('#learning-guide-moon')).toHaveAttribute(
      'src', `/assets/learning-moons/${phaseGuideImages[index]}`,
    );
    expect(await page.locator('#learning-guide-moon').evaluate((image: HTMLImageElement) => ({
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    }))).toEqual({ complete: true, naturalWidth: 640, naturalHeight: 640 });
    await expect(page.locator('#sky-phase-name')).toBeVisible();
    const box = await page.locator('#sky-phase-name').boundingBox();
    if (!box) throw new Error('Named phase label has no bounding box.');
    namedPhasePositions.push(box.x + box.width / 2);
    await page.locator('#learning-guide-confirm').click();
    await expect(page.locator('#learning-guide')).toBeHidden();
  }
  for (let index = 0; index < namedPhasePositions.length - 1; index += 1) {
    expect(namedPhasePositions[index]).toBeGreaterThan(namedPhasePositions[index + 1]);
  }
  await page.locator('.phase-marker').nth(1).click();
  await expect(page.locator('#learning-guide-title')).toHaveText('음력 7일 상현달');
  await expect(page.locator('#date-label')).toHaveText('음력 7일');
  await expect(page.locator('#phase-label')).toHaveText('상현달');
  await expect(page.locator('#sky-phase-name')).toBeVisible();
  await expect(page.locator('#sky-phase-name')).toHaveText('상현달');
  await expect(page.locator('.phase-marker').nth(1)).toHaveClass(/is-active/);
  await expect(page.locator('#date-label')).toContainText('음력');
  await page.locator('#learning-guide-confirm').click();
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

  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setPausedForScreenshot(false));
  await page.locator('#view-button').click();
  await expect.poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.mode)).toBe('journey');
  await expect.poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.mode), { timeout: 2_000 }).toBe('split');
  await expect(page.locator('#split-labels')).toBeVisible();
  await expect(page.locator('#guide-note')).toBeVisible();
  await expect(page.locator('#view-button')).toBeVisible();
  await expect(page.locator('#view-button')).toHaveText('하늘만 보기');
  await expect(page.locator('#space-actions')).toHaveCount(0);
  await expect(page.locator('#space-camera-button')).toHaveCount(0);
  await expect(page.locator('#space-full-button')).toHaveCount(0);
  await expect(page.locator('#space-zoom-out')).toHaveCount(0);
  await expect(page.locator('#space-zoom-in')).toHaveCount(0);
  await expect(page.locator('#space-reset')).toHaveCount(0);
  await expect.poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.spaceCamera.redRegionVisible)).toBe(true);
  await expect.poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.spaceCamera.observerSurfaceGap ?? 1)).toBeCloseTo(0, 5);
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setPausedForScreenshot(true));

  for (const day of [0, 3, 7, 14, 21.5, 27]) {
    await page.evaluate((value) => window.__THREE_GAME_TEST_HOOKS__?.setTime(value), day);
    await expect.poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.elapsedDays ?? -1)).toBeCloseTo(day, 3);
    const illuminationError = await page.evaluate(() => {
      const lighting = window.__THREE_GAME_DIAGNOSTICS__?.spaceLighting;
      return lighting ? Math.abs(lighting.expectedIllumination - lighting.redIllumination) : 1;
    });
    expect(illuminationError).toBeLessThan(0.0001);
    await expect.poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.spaceCamera.autoFrameAlignment ?? 0)).toBeGreaterThan(0.999);
  }
  await page.evaluate(() => window.__THREE_GAME_TEST_HOOKS__?.setTime(7 + 15.75 / 24));
  await expect.poll(async () => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.elapsedDays ?? -1)).toBeCloseTo(7 + 15.75 / 24, 3);
  const fixedCameraBeforeInput = await page.evaluate(() => {
    const camera = window.__THREE_GAME_DIAGNOSTICS__?.spaceCamera;
    return { direction: camera?.cameraDirection.join(',') ?? '', radius: camera?.orbitRadius ?? 0 };
  });
  const canvasBox = await page.locator('#game-canvas').boundingBox();
  if (!canvasBox) throw new Error('Canvas has no bounding box.');
  const dragStartX = canvasBox.x + canvasBox.width * (canvasBox.width < 720 ? 0.5 : 0.78);
  const dragStartY = canvasBox.y + canvasBox.height * (canvasBox.width < 720 ? 0.76 : 0.46);
  await page.mouse.move(dragStartX, dragStartY);
  await page.mouse.down();
  await page.mouse.move(dragStartX + 70, dragStartY - 36, { steps: 5 });
  await page.mouse.up();
  await page.locator('#game-canvas').dispatchEvent('wheel', { deltaY: 420 });
  await page.waitForTimeout(100);
  const fixedCameraAfterInput = await page.evaluate(() => {
    const camera = window.__THREE_GAME_DIAGNOSTICS__?.spaceCamera;
    return { direction: camera?.cameraDirection.join(',') ?? '', radius: camera?.orbitRadius ?? 0 };
  });
  expect(fixedCameraAfterInput).toEqual(fixedCameraBeforeInput);
  await expectCanvasVaried(page);

  await testInfo.attach(`${testInfo.project.name}-moon-lab`, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
