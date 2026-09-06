import assert from 'node:assert/strict';
import type { AnimationFrame, AnimationProject } from '../src/types';
import {
  createAnimationProjectHistory,
  getActiveFrameIndexAfterFrameRemoval,
  pushAnimationProjectHistory,
  redoAnimationProjectHistory,
  undoAnimationProjectHistory,
} from '../src/utils/animationHistory';

const frame = (id: string): AnimationFrame => ({
  id,
  thumbnailUrl: `data:image/png;base64,${id}`,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  duration: 1,
});

const project = (name: string, frames: AnimationFrame[] = []): AnimationProject => ({
  id: 'anim_proj',
  name,
  frames,
  fps: 8,
  loop: true,
  width: 32,
  height: 32,
});

let history = createAnimationProjectHistory();
const firstSnapshot = { project: project('first', [frame('a')]), activeFrameIndex: 0 };
const secondSnapshot = { project: project('second', [frame('a'), frame('b')]), activeFrameIndex: 1 };
const currentSnapshot = { project: project('third', [frame('c')]), activeFrameIndex: 0 };

history = pushAnimationProjectHistory(history, firstSnapshot);
history = pushAnimationProjectHistory(history, secondSnapshot);

const undoResult = undoAnimationProjectHistory(history, currentSnapshot);
assert.ok(undoResult);
assert.equal(undoResult.snapshot.project.name, 'second');
assert.equal(undoResult.snapshot.activeFrameIndex, 1);
assert.equal(undoResult.history.future[0].project.name, 'third');

const redoResult = redoAnimationProjectHistory(undoResult.history, undoResult.snapshot);
assert.ok(redoResult);
assert.equal(redoResult.snapshot.project.name, 'third');
assert.equal(redoResult.history.past.at(-1)?.project.name, 'second');

const branchedHistory = pushAnimationProjectHistory(undoResult.history, undoResult.snapshot);
assert.equal(branchedHistory.future.length, 0);

let cappedHistory = createAnimationProjectHistory();
for (let index = 0; index < 60; index += 1) {
  cappedHistory = pushAnimationProjectHistory(cappedHistory, { project: project(`p${index}`), activeFrameIndex: 0 });
}
assert.equal(cappedHistory.past.length, 50);
assert.equal(cappedHistory.past[0].project.name, 'p10');

assert.equal(getActiveFrameIndexAfterFrameRemoval(3, 2, 1), 1);
assert.equal(getActiveFrameIndexAfterFrameRemoval(3, 1, 1), 1);
assert.equal(getActiveFrameIndexAfterFrameRemoval(1, 0, 0), 0);

console.log('animation history tests passed');
