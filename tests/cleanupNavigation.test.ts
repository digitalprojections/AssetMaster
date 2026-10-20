import assert from 'node:assert/strict';
import test from 'node:test';
import { getCleanupNavigation } from '../src/utils/cleanupNavigation';

const frames = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
test('cleanup navigation follows frame order in both directions', () => {
  assert.deepEqual(getCleanupNavigation(frames, 'b'), { index: 1, total: 3, previous: frames[0], next: frames[2] });
});
test('cleanup navigation stops at either end', () => {
  assert.equal(getCleanupNavigation(frames, 'a').previous, null);
  assert.equal(getCleanupNavigation(frames, 'c').next, null);
});
test('cleanup navigation follows the visible list when sources are filtered', () => {
  const visibleFrames = [frames[0], frames[2]];
  assert.equal(getCleanupNavigation(visibleFrames, 'a').next, frames[2]);
  assert.equal(getCleanupNavigation(visibleFrames, 'c').previous, frames[0]);
});
test('cleanup navigation handles empty, missing and single frames', () => {
  assert.deepEqual(getCleanupNavigation([], 'a'), { index: -1, total: 0, previous: null, next: null });
  assert.deepEqual(getCleanupNavigation(frames, 'missing'), { index: -1, total: 3, previous: null, next: null });
  assert.deepEqual(getCleanupNavigation([frames[0]], 'a'), { index: 0, total: 1, previous: null, next: null });
});
