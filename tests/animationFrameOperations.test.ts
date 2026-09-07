import assert from 'node:assert/strict';
import type { AnimationFrame } from '../src/types';
import {
  applyAnimationFrameTransformPatch,
  clampAnimationFrameDuration,
  clampAnimationFrameIndex,
  clampAnimationFrameScale,
  createAnimationLoopRange,
  duplicateAnimationFrameAt,
  getActiveFrameIndexAfterAnimationFrameRemoval,
  getNextAnimationPlaybackFrameIndex,
  moveAnimationFrame,
  normalizeAnimationFrameSelection,
  removeAnimationFrameAt,
  selectAnimationFrameRange,
  setAnimationFrameDuration,
  shiftAnimationFrame,
  toggleAnimationFrameSelection,
  updateSelectedAnimationFrames,
} from '../src/utils/animationFrameOperations';

const frame = (id: string): AnimationFrame => ({
  id,
  thumbnailUrl: `data:image/png;base64,${id}`,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  duration: 1,
});

const frames = ['a', 'b', 'c', 'd'].map(frame);
const ids = (items: AnimationFrame[]) => items.map((item) => item.id);

assert.equal(clampAnimationFrameIndex(0, 4), 0);
assert.equal(clampAnimationFrameIndex(4, -2), 0);
assert.equal(clampAnimationFrameIndex(4, 99), 3);
assert.equal(clampAnimationFrameIndex(4, 1.9), 1);
assert.equal(clampAnimationFrameIndex(4, Number.NaN), 0);

assert.equal(clampAnimationFrameScale(Number.NaN), 1);
assert.equal(clampAnimationFrameScale(0.01), 0.1);
assert.equal(clampAnimationFrameScale(6), 3);

assert.equal(clampAnimationFrameDuration(Number.NaN), 1);
assert.equal(clampAnimationFrameDuration(0.001), 0.1);
assert.equal(clampAnimationFrameDuration(500), 120);
assert.equal(clampAnimationFrameDuration(1.23456), 1.235);

assert.deepEqual(normalizeAnimationFrameSelection([3, 1, 1, -1, 9, 2], 4), [1, 2, 3]);
assert.deepEqual(selectAnimationFrameRange(3, 1, 4), [1, 2, 3]);
assert.deepEqual(selectAnimationFrameRange(-10, 99, 4), [0, 1, 2, 3]);
assert.deepEqual(toggleAnimationFrameSelection([1, 3], 1, 4), [3]);
assert.deepEqual(toggleAnimationFrameSelection([1, 3], 2, 4), [1, 2, 3]);
assert.deepEqual(toggleAnimationFrameSelection([1], 9, 4), [1]);

assert.deepEqual(ids(removeAnimationFrameAt(frames, 1)), ['a', 'c', 'd']);
assert.deepEqual(ids(removeAnimationFrameAt(frames, -1)), ['a', 'b', 'c', 'd']);
assert.equal(getActiveFrameIndexAfterAnimationFrameRemoval(4, 3, 1), 2);
assert.equal(getActiveFrameIndexAfterAnimationFrameRemoval(4, 1, 1), 1);
assert.equal(getActiveFrameIndexAfterAnimationFrameRemoval(1, 0, 0), 0);

assert.deepEqual(ids(moveAnimationFrame(frames, 0, 2)), ['b', 'c', 'a', 'd']);
assert.deepEqual(ids(moveAnimationFrame(frames, 3, 1)), ['a', 'd', 'b', 'c']);
assert.deepEqual(ids(moveAnimationFrame(frames, 3, 9)), ['a', 'b', 'c', 'd']);

const shiftedLeft = shiftAnimationFrame(frames, 2, 'left');
assert.deepEqual(ids(shiftedLeft.frames), ['a', 'c', 'b', 'd']);
assert.equal(shiftedLeft.activeFrameIndex, 1);

const shiftedRightAtEnd = shiftAnimationFrame(frames, 3, 'right');
assert.deepEqual(ids(shiftedRightAtEnd.frames), ['a', 'b', 'c', 'd']);
assert.equal(shiftedRightAtEnd.activeFrameIndex, 3);

const sourceWithMask: AnimationFrame = {
  ...frame('masked'),
  eraseStrokes: [{
    id: 'erase_1',
    radius: 8,
    points: [{ x: 1, y: 2 }],
  }],
};
const duplicated = duplicateAnimationFrameAt([sourceWithMask], 0, (source, index) => `${source.id}_copy_${index}`);
assert.deepEqual(ids(duplicated.frames), ['masked', 'masked_copy_0']);
assert.equal(duplicated.activeFrameIndex, 1);
assert.notEqual(duplicated.frames[1].eraseStrokes, sourceWithMask.eraseStrokes);
assert.notEqual(duplicated.frames[1].eraseStrokes?.[0].points, sourceWithMask.eraseStrokes?.[0].points);
duplicated.frames[1].eraseStrokes?.[0].points.push({ x: 9, y: 9 });
assert.equal(sourceWithMask.eraseStrokes?.[0].points.length, 1);

const durationFrames = setAnimationFrameDuration(frames, 2, 2.3456);
assert.equal(durationFrames[2].duration, 2.346);
assert.equal(setAnimationFrameDuration(frames, 22, 2)[0], frames[0]);

const transformed = applyAnimationFrameTransformPatch(frames, [0, 2], {
  offsetX: 8,
  offsetY: -4,
  scale: 4,
  flipX: true,
  flipY: true,
  pivotX: 11,
  pivotY: 12,
});
assert.equal(transformed[0].offsetX, 8);
assert.equal(transformed[0].offsetY, -4);
assert.equal(transformed[0].scale, 3);
assert.equal(transformed[0].flipX, true);
assert.equal(transformed[0].flipY, true);
assert.equal(transformed[0].pivotX, 11);
assert.equal(transformed[0].pivotY, 12);
assert.equal(transformed[1], frames[1]);
assert.equal(transformed[2].offsetX, 8);

const updated = updateSelectedAnimationFrames(frames, [1, 3], (item) => ({
  ...item,
  offsetX: item.offsetX + 5,
}));
assert.equal(updated[1].offsetX, 5);
assert.equal(updated[3].offsetX, 5);
assert.equal(updated[0], frames[0]);

assert.deepEqual(createAnimationLoopRange(4, 3, 1), { startFrameIndex: 1, endFrameIndex: 3 });
assert.deepEqual(createAnimationLoopRange(4, -10, 99), { startFrameIndex: 0, endFrameIndex: 3 });
assert.equal(createAnimationLoopRange(0, 0, 2), null);

assert.equal(getNextAnimationPlaybackFrameIndex(0, 4, true), 1);
assert.equal(getNextAnimationPlaybackFrameIndex(3, 4, true), 0);
assert.equal(getNextAnimationPlaybackFrameIndex(3, 4, false), 3);
assert.equal(getNextAnimationPlaybackFrameIndex(1, 4, true, { startFrameIndex: 1, endFrameIndex: 2 }), 2);
assert.equal(getNextAnimationPlaybackFrameIndex(2, 4, true, { startFrameIndex: 1, endFrameIndex: 2 }), 1);
assert.equal(getNextAnimationPlaybackFrameIndex(0, 4, true, { startFrameIndex: 1, endFrameIndex: 2 }), 1);

console.log('animation frame operation tests passed');
