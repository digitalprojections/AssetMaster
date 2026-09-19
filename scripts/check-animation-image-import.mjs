// Run with a local dev server: node scripts/check-animation-image-import.mjs <image-folder>
// Requires Playwright (or NODE_PATH pointing to an existing Playwright installation).
import assert from 'node:assert/strict';
import { mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const folder = resolve(process.argv[2] || '../Treasure-Hunter/assets/heroes/mage/walk');
const paths = (await readdir(folder)).filter(name => /\.png$/i.test(name)).sort().map(name => resolve(folder, name));
assert.ok(paths.length > 1, 'Provide a folder containing at least two PNG frames.');
const browser = await chromium.launch({ headless: true, channel: process.env.ASSETMASTER_BROWSER || 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('test-results', { recursive: true });

async function savedProject() {
  return page.evaluate(async () => {
    const request = indexedDB.open('assetmaster-db', 1);
    const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try {
      const read = db.transaction('records').objectStore('records').get('assetmaster.animationStudio.project.v1');
      const record = await new Promise((resolve, reject) => { read.onsuccess = () => resolve(read.result); read.onerror = () => reject(read.error); });
      return record?.value?.project;
    } finally { db.close(); }
  });
}
async function waitForFrameCount(count) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const project = await savedProject();
    if (project?.frames.length === count) return project;
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for ${count} saved frames.`);
}
async function choose(button, selection) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: button, exact: true }).click();
  await (await chooser).setFiles(selection);
}
try {
  await page.goto(process.env.ASSETMASTER_URL || 'http://127.0.0.1:3000/');
  await page.getByRole('button', { name: 'Open Animation Studio', exact: true }).click();
  await choose('Choose Folder', folder);
  await page.getByRole('status').filter({ hasText: `Added ${paths.length} frames` }).waitFor();
  const initial = await waitForFrameCount(paths.length);
  assert.equal(initial.name, folder.split(/[\\/]/).at(-1));
  assert.equal(initial.fps, 8);
  assert.ok(initial.frames.every(frame => frame.sliceW > 0 && frame.sliceH > 0 && frame.sourceSegmentId));
  assert.deepEqual(initial.frames.map(frame => frame.sourceSegmentId.split('_').at(-1)), paths.map((_, index) => String(index)));
  // Inspect decoded pixels, including transparency, from the actual imported image.
  const pixels = await page.evaluate(async url => {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, image.width, image.height).data;
    let transparent = 0, visible = 0;
    for (let i = 3; i < data.length; i += 4) { if (data[i] === 0) transparent++; else visible++; }
    return { width: image.width, height: image.height, transparent, visible };
  }, initial.frames[0].thumbnailUrl);
  assert.ok(pixels.transparent > 0 && pixels.visible > 0);
  await page.getByTitle('Play Loop', { exact: true }).click();
  await page.getByText(`F 2 / ${paths.length}`, { exact: true }).waitFor();
  await page.getByTitle('Pause Loop', { exact: true }).click();
  await page.getByRole('button', { name: 'Undo animation edit', exact: true }).filter({ visible: true }).click();
  await waitForFrameCount(0);
  await page.getByRole('button', { name: 'Redo animation edit', exact: true }).filter({ visible: true }).click();
  await waitForFrameCount(paths.length);
  await choose('Choose Images', [...paths].reverse());
  const appended = await waitForFrameCount(paths.length * 2);
  assert.deepEqual(appended.frames.slice(0, paths.length), initial.frames);
  assert.deepEqual(appended.frames.slice(paths.length).map(frame => frame.thumbnailUrl), initial.frames.map(frame => frame.thumbnailUrl));
  await choose('Choose Images', [{ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('broken image') }]);
  await page.getByRole('status').filter({ hasText: 'No frames were imported' }).waitFor();
  assert.equal((await savedProject()).frames.length, paths.length * 2);
  await page.screenshot({ path: 'test-results/animation-images-desktop.png' });
  await page.reload();
  await page.getByRole('button', { name: 'Open Animation Studio', exact: true }).click();
  const restored = await waitForFrameCount(paths.length * 2);
  assert.deepEqual(restored.frames, appended.frames);
  for (const [label, width, height] of [['portrait', 390, 844], ['landscape', 844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole('button', { name: 'Source & Slice', exact: true }).click();
    const button = page.getByRole('button', { name: 'Choose Folder', exact: true });
    await button.scrollIntoViewIfNeeded();
    const bounds = await button.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height);
    await page.screenshot({ path: `test-results/animation-images-${label}.png` });
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ frames: paths.length, pixels, checks: ['folder picker', 'multiple files', 'filename order', 'transparency', 'playback', 'append', 'undo', 'redo', 'corrupt file', 'reload', 'portrait', 'landscape'] }, null, 2));
} finally { await context.close(); await browser.close(); }
