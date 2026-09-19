// Requires a running dev server and Playwright (available through NODE_PATH if installed elsewhere).
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.ASSETMASTER_BROWSER || 'chrome' });
await mkdir('test-results', { recursive: true });
const results = [];
try {
  for (const [label, width, height] of [['desktop', 1440, 900], ['narrow', 320, 700], ['portrait', 390, 844], ['landscape', 844, 390]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.ASSETMASTER_URL || 'http://127.0.0.1:3001/');
    await page.getByRole('button', { name: 'Open Animation Studio', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Animation Studio usage tips', exact: true });
    await panel.waitFor();
    assert.match(await panel.innerText(), /numbered in timeline order/);
    const bounds = await panel.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height, `${label}: tips must fit viewport`);
    const close = page.getByRole('button', { name: 'Dismiss usage tips', exact: true });
    const closeBounds = await close.boundingBox();
    assert.ok(closeBounds.y + closeBounds.height <= height && closeBounds.height >= 36);
    const workspace = page.locator('#animation-studio-container > header + div');
    const before = await workspace.boundingBox();
    await page.screenshot({ path: `test-results/usage-tips-${label}.png` });
    await close.click();
    assert.equal(await panel.count(), 0);
    assert.deepEqual(await workspace.boundingBox(), before, `${label}: dismissing tips must not move workspace`);
    await page.getByRole('button', { name: 'Show usage tips', exact: true }).click();
    await panel.waitFor();
    assert.deepEqual(await workspace.boundingBox(), before);
    await page.keyboard.press('Escape');
    assert.equal(await panel.count(), 0);
    await page.reload();
    await page.getByRole('button', { name: 'Open Animation Studio', exact: true }).click();
    await page.getByRole('button', { name: 'Show usage tips', exact: true }).waitFor();
    assert.equal(await panel.count(), 0, 'Dismissal must survive reload');
    await page.getByRole('button', { name: 'Show usage tips', exact: true }).click();
    await panel.waitFor();
    await page.getByRole('button', { name: 'Dismiss usage tips', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await panel.count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Show usage tips', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.getByRole('button', { name: 'Show usage tips', exact: true }).click();
    await panel.waitFor();
    await page.locator('#animation-studio-container > header h1').click();
    assert.equal(await panel.count(), 0, 'Clicking outside should dismiss without a blocking backdrop');
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.equal(pageWidth, width, `${label}: no horizontal overflow`);
    assert.deepEqual(errors, []);
    results.push({ viewport: label, width, height, layoutShift: false, dismissalPersists: true, keyboard: true });
    await context.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
