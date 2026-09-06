import assert from 'node:assert/strict';
import {
  appendPointToEraseStroke,
  clampFrameEraserRadius,
  createAnimationEraseStroke,
} from '../src/utils/animationFrameEraser';

assert.equal(clampFrameEraserRadius(Number.NaN), 12);
assert.equal(clampFrameEraserRadius(1), 2);
assert.equal(clampFrameEraserRadius(90), 64);
assert.equal(clampFrameEraserRadius(12.6), 13);

const ignoredNearPoint = appendPointToEraseStroke([{ x: 10, y: 10 }], { x: 10.2, y: 10.1 });
assert.equal(ignoredNearPoint.length, 1);

const addedPoint = appendPointToEraseStroke([{ x: 10, y: 10 }], { x: 13, y: 10 });
assert.equal(addedPoint.length, 2);

const stroke = createAnimationEraseStroke([{ x: 1.2, y: 2.7 }], 5.4, 'erase_test');
assert.equal(stroke.id, 'erase_test');
assert.deepEqual(stroke.points, [{ x: 1, y: 3 }]);
assert.equal(stroke.radius, 5);

console.log('animation frame eraser tests passed');
