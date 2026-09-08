import assert from 'node:assert/strict';
import {
  appendPointToEraseStroke,
  clampFrameEraserRadius,
  createAnimationEraseStroke,
  createRectangleEraseSelectionPoints,
  createSquareEraseSelectionPoints,
  getAdjustedEraseStrokePoints,
  getFrameImagePointFromRenderedRect,
  getRectangleEraseBounds,
  getSquareEraseBounds,
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
assert.equal(stroke.shape, 'brush');

const sourceAnchoredStroke = createAnimationEraseStroke(
  [{ x: 10, y: 15 }],
  8,
  'source_offset_test',
  { sliceX: 20.2, sliceY: 5.6 }
);
assert.equal(sourceAnchoredStroke.sourceSliceX, 20);
assert.equal(sourceAnchoredStroke.sourceSliceY, 6);
assert.deepEqual(
  getAdjustedEraseStrokePoints(sourceAnchoredStroke, { sliceX: 24, sliceY: 2 }),
  [{ x: 6, y: 19 }]
);
assert.deepEqual(
  getAdjustedEraseStrokePoints(stroke, { sliceX: 24, sliceY: 2 }),
  stroke.points
);

assert.deepEqual(
  createSquareEraseSelectionPoints({ x: 10, y: 10 }, { x: 18, y: 14 }),
  [{ x: 10, y: 10 }, { x: 18, y: 14 }]
);
assert.deepEqual(
  createRectangleEraseSelectionPoints({ x: 10, y: 10 }, { x: 6, y: 15 }),
  [{ x: 10, y: 10 }, { x: 6, y: 15 }]
);

const squareStroke = createAnimationEraseStroke(
  createSquareEraseSelectionPoints({ x: 10, y: 10 }, { x: 18, y: 14 }),
  8,
  'square_erase_test',
  { sliceX: 4, sliceY: 6 },
  'selection'
);
assert.equal(squareStroke.shape, 'selection');
assert.deepEqual(
  getSquareEraseBounds(squareStroke, { sliceX: 6, sliceY: 3 }),
  { x: 8, y: 13, width: 8, height: 4 }
);
assert.deepEqual(
  getRectangleEraseBounds(squareStroke, { sliceX: 6, sliceY: 3 }),
  { x: 8, y: 13, width: 8, height: 4 }
);

assert.deepEqual(
  getFrameImagePointFromRenderedRect(
    { x: 180, y: 95 },
    { left: 140, top: 55, width: 80, height: 100 },
    { width: 160, height: 200 }
  ),
  { x: 80, y: 80 }
);
assert.equal(
  getFrameImagePointFromRenderedRect(
    { x: 120, y: 95 },
    { left: 140, top: 55, width: 80, height: 100 },
    { width: 160, height: 200 }
  ),
  null
);

console.log('animation frame eraser tests passed');
