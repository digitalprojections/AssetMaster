import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderSingleAnimationFrame, frameExportFilename } from '../src/utils/animationFrameExport';

test('single frame export draws only the requested frame with its transforms', () => {
  const calls: unknown[][] = [];
  const ctx = Object.fromEntries(['clearRect', 'save', 'translate', 'scale', 'drawImage', 'restore'].map(name => [name, (...args: unknown[]) => calls.push([name, ...args])])) as unknown as CanvasRenderingContext2D;
  const image = {} as CanvasImageSource;
  renderSingleAnimationFrame(ctx, image, { offsetX: 4, offsetY: -3, scale: 2, flipX: true, flipY: false }, 100, 80, { x: 12, y: 9 });
  assert.deepEqual(calls, [['clearRect', 0, 0, 100, 80], ['save'], ['translate', 54, 37], ['scale', -2, 2], ['drawImage', image, -12, -9], ['restore']]);
});

test('frame filenames are safe, numbered and have a fallback project name', () => {
  assert.equal(frameExportFilename('Walk', 2), 'Walk_frame_003.png');
  assert.equal(frameExportFilename('a/b:c', 0), 'a_b_c_frame_001.png');
  assert.equal(frameExportFilename('  ', 0), 'assetmaster_frame_001.png');
});

test('both studio layouts expose current-frame saving', () => {
  const source = readFileSync('src/components/AnimationStudio.tsx', 'utf8');
  assert.equal(source.split('<span>Save Current Frame PNG</span>').length - 1, 2);
});
