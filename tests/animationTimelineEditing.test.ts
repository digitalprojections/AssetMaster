import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnimationProjectHistory, pushAnimationProjectHistory, undoAnimationProjectHistory, redoAnimationProjectHistory } from '../src/utils/animationHistory';
import type { AnimationFrame } from '../src/types';
import { copyAnimationFrames, pasteAnimationFrames, moveSelectedAnimationFrames, reverseSelectedAnimationFrames } from '../src/utils/animationFrameOperations';

const makeFrames = (): AnimationFrame[] => ['a', 'b', 'c', 'd', 'e'].map((id, index) => ({
  id, thumbnailUrl: id, offsetX: index, offsetY: 0, scale: 1, duration: index + 1,
  eraseStrokes: [{ id: 'stroke', radius: 3, points: [{ x: index, y: 2 }] }],
  trimmedBounds: { x: index, y: 0, width: 10, height: 10 },
}));
const ids = (frames: readonly AnimationFrame[]) => frames.map(frame => frame.id);

test('copy selects valid unique indexes in timeline order with independent mutable edits', () => {
  const frames = makeFrames();
  const copies = copyAnimationFrames(frames, [3, 1, 1, -1, 99]);
  assert.deepEqual(ids(copies), ['b', 'd']);
  copies[0].eraseStrokes![0].points[0].x = 999;
  copies[0].trimmedBounds!.x = 999;
  assert.equal(frames[1].eraseStrokes![0].points[0].x, 1);
  assert.equal(frames[1].trimmedBounds!.x, 1);
});

test('paste inserts at a boundary, creates unique frames and supports repeated pastes', () => {
  const frames = makeFrames();
  const clipboard = copyAnimationFrames(frames, [1, 2]);
  let nextId = 0;
  const pasted = pasteAnimationFrames(frames, clipboard, 3, () => `copy${nextId++}`);
  assert.deepEqual(ids(pasted.frames), ['a', 'b', 'c', 'copy0', 'copy1', 'd', 'e']);
  assert.deepEqual(pasted.insertedIds, ['copy0', 'copy1']);
  pasted.frames[3].eraseStrokes![0].points[0].x = 99;
  const again = pasteAnimationFrames(pasted.frames, clipboard, 0, () => `copy${nextId++}`);
  assert.equal(again.frames[0].eraseStrokes![0].points[0].x, 1);
  assert.equal(again.frames[0].duration, 2);
  assert.equal(again.frames[0].thumbnailUrl, frames[1].thumbnailUrl);
  assert.equal(new Set(ids(again.frames)).size, again.frames.length);
});

test('dragging contiguous selection forward and backward preserves relative order', () => {
  const frames = makeFrames();
  assert.deepEqual(ids(moveSelectedAnimationFrames(frames, [1, 2], 5)), ['a', 'd', 'e', 'b', 'c']);
  assert.deepEqual(ids(moveSelectedAnimationFrames(frames, [2, 3], 0)), ['c', 'd', 'a', 'b', 'e']);
  assert.deepEqual(ids(frames), ['a', 'b', 'c', 'd', 'e']);
});

test('dragging disjoint frames uses the original insertion boundary without off-by-one', () => {
  const frames = makeFrames();
  assert.deepEqual(ids(moveSelectedAnimationFrames(frames, [1, 3], 3)), ['a', 'c', 'b', 'd', 'e']);
  assert.deepEqual(ids(moveSelectedAnimationFrames(frames, [1, 2], 2)), ids(frames));
  assert.deepEqual(ids(moveSelectedAnimationFrames(frames, [1, 2], 3)), ids(frames));
});

test('reverse changes selected positions only and retains all frame properties', () => {
  const frames = makeFrames();
  const reversed = reverseSelectedAnimationFrames(frames, [1, 3, 4]);
  assert.deepEqual(ids(reversed), ['a', 'e', 'c', 'd', 'b']);
  assert.equal(reversed[1], frames[4]);
  assert.equal(reversed[2], frames[2]);
  assert.deepEqual(ids(reverseSelectedAnimationFrames(reversed, [1, 3, 4])), ids(frames));
});

test('empty, invalid and single selections are safe no-ops', () => {
  const frames = makeFrames();
  assert.deepEqual(copyAnimationFrames(frames, []), []);
  assert.deepEqual(ids(reverseSelectedAnimationFrames(frames, [2])), ids(frames));
  assert.deepEqual(ids(moveSelectedAnimationFrames(frames, [-1, 99], 0)), ids(frames));
  assert.deepEqual(ids(moveSelectedAnimationFrames(frames, [1], Number.NaN)), ids(frames));
  assert.deepEqual(pasteAnimationFrames([], [], 0, () => 'id'), { frames: [], insertedIds: [] });
});


test('undo and redo preserve selected frame identities and active frame after range editing', () => {
  const frames = makeFrames();
  const project = { id: 'project', name: 'Test', frames, fps: 8, loop: true, width: 32, height: 32 };
  const before = { project, activeFrameIndex: 1, selectedFrameIds: ['b', 'c'] };
  const after = { project: { ...project, frames: reverseSelectedAnimationFrames(frames, [1, 2]) }, activeFrameIndex: 2, selectedFrameIds: ['b', 'c'] };
  const history = pushAnimationProjectHistory(createAnimationProjectHistory(), before);
  const undone = undoAnimationProjectHistory(history, after)!;
  assert.deepEqual(ids(undone.snapshot.project.frames), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(undone.snapshot.selectedFrameIds, ['b', 'c']);
  assert.equal(undone.snapshot.activeFrameIndex, 1);
  const redone = redoAnimationProjectHistory(undone.history, undone.snapshot)!;
  assert.deepEqual(ids(redone.snapshot.project.frames), ['a', 'c', 'b', 'd', 'e']);
  assert.deepEqual(redone.snapshot.selectedFrameIds, ['b', 'c']);
  assert.equal(redone.snapshot.activeFrameIndex, 2);
});
