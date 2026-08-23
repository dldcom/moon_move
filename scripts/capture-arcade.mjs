import fs from 'node:fs';
import { chromium } from '@playwright/test';

const outputDirectory = 'artifacts/moon-arcade-v1';
fs.mkdirSync(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#game-button').click();
  await page.waitForTimeout(2400);
  await page.waitForFunction(() => {
    const debug = window.__MOON_ARCADE_DEBUG__;
    return Boolean(debug?.moons.some((moon) => moon.visible && moon.phase === debug.target));
  });
  const targetMoon = await page.evaluate(() => {
    const debug = window.__MOON_ARCADE_DEBUG__;
    return debug?.moons.find((moon) => moon.visible && moon.phase === debug.target);
  });
  const canvasBox = await page.locator('#arcade-canvas canvas').boundingBox();
  if (targetMoon && canvasBox) await page.mouse.click(canvasBox.x + targetMoon.x, canvasBox.y + targetMoon.y);
  await page.waitForTimeout(120);
  await page.screenshot({ path: `${outputDirectory}/${viewport.name}.png`, fullPage: true });
  const score = await page.locator('#arcade-score-value').textContent();
  fs.writeFileSync(`${outputDirectory}/${viewport.name}.json`, JSON.stringify({ viewport, errors, score }, null, 2));
  await page.close();
}
await browser.close();
