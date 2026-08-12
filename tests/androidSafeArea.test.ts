import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const appShell = readFileSync('src/App.tsx', 'utf8');
const animationStudio = readFileSync('src/components/AnimationStudio.tsx', 'utf8');
const backgroundRemover = readFileSync('src/components/BackgroundRemover.tsx', 'utf8');
const collageStudio = readFileSync('src/components/CollageStudio.tsx', 'utf8');
const globalCss = readFileSync('src/index.css', 'utf8');

test('top app controls avoid Android edge-to-edge system areas', () => {
  assert.match(globalCss, /\.safe-area-top-bar/u);
  assert.match(globalCss, /env\(safe-area-inset-top/u);
  assert.match(globalCss, /env\(safe-area-inset-left/u);
  assert.match(globalCss, /env\(safe-area-inset-right/u);

  assert.match(appShell, /<header id="main-header" className="[^"]*safe-area-top-bar/u);
  assert.match(appShell, /Mobile sidebar header[\s\S]*safe-area-top-bar/u);
  assert.match(animationStudio, /<header className="[^"]*safe-area-top-bar/u);
  assert.match(backgroundRemover, /<header className="[^"]*safe-area-top-bar/u);
  assert.match(collageStudio, /<header className="[^"]*safe-area-top-bar/u);
});

test('mobile app title has a dedicated header row', () => {
  assert.match(appShell, /<header id="main-header" className="[^"]*flex-col[^"]*md:flex-row/u);
  assert.match(appShell, /<div className="flex w-full items-center justify-between/u);
  assert.match(appShell, /<div className="flex min-w-0 flex-1 items-center/u);
  assert.match(appShell, /<div className="flex w-full flex-wrap items-center/u);
});
