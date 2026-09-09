import assert from 'node:assert/strict';
import {
  detectAutoSelectionRows,
  getAutoSelectionRowAtPoint,
  getAutoSelectionRowNearContour,
} from '../src/utils/imageAutoSelection';

const makeImageData = (width: number, height: number, fill: [number, number, number, number]) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = fill[3];
  }
  return { data, width, height } as ImageData;
};

const paintRect = (
  imageData: ImageData,
  rect: { x: number; y: number; width: number; height: number },
  fill: [number, number, number, number]
) => {
  const { data, width } = imageData;
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const idx = (y * width + x) * 4;
      data[idx] = fill[0];
      data[idx + 1] = fill[1];
      data[idx + 2] = fill[2];
      data[idx + 3] = fill[3];
    }
  }
};

const transparentSheet = makeImageData(80, 90, [0, 0, 0, 0]);
paintRect(transparentSheet, { x: 8, y: 6, width: 64, height: 18 }, [220, 30, 30, 255]);
paintRect(transparentSheet, { x: 8, y: 36, width: 64, height: 18 }, [30, 220, 30, 255]);
paintRect(transparentSheet, { x: 8, y: 66, width: 64, height: 18 }, [30, 30, 220, 255]);

const transparentDetection = detectAutoSelectionRows(transparentSheet);
assert.equal(transparentDetection.rows.length, 3);
assert.equal(transparentDetection.contourLines.length, 2);
assert.ok(transparentDetection.contourLines[0] > 24 && transparentDetection.contourLines[0] < 36);
assert.ok(transparentDetection.contourLines[1] > 54 && transparentDetection.contourLines[1] < 66);
assert.equal(getAutoSelectionRowAtPoint(transparentDetection, { x: 20, y: 40 })?.index, 1);
assert.equal(getAutoSelectionRowAtPoint(transparentDetection, { x: 20, y: 86 })?.index, 2);
assert.equal(getAutoSelectionRowAtPoint(transparentDetection, { x: -1, y: 40 }), null);
assert.equal(getAutoSelectionRowNearContour(transparentDetection, { x: 20, y: transparentDetection.contourLines[0] + 1 }, 3)?.index, 1);
assert.equal(getAutoSelectionRowNearContour(transparentDetection, { x: 20, y: transparentDetection.contourLines[0] - 1 }, 3)?.index, 0);
assert.equal(getAutoSelectionRowNearContour(transparentDetection, { x: 20, y: 8 }, 3), null);

const opaqueSheet = makeImageData(60, 64, [245, 245, 245, 255]);
paintRect(opaqueSheet, { x: 6, y: 6, width: 48, height: 16 }, [30, 80, 190, 255]);
paintRect(opaqueSheet, { x: 6, y: 40, width: 48, height: 16 }, [190, 80, 30, 255]);

const opaqueDetection = detectAutoSelectionRows(opaqueSheet);
assert.equal(opaqueDetection.rows.length, 2);
assert.equal(opaqueDetection.contourLines.length, 1);
assert.ok(opaqueDetection.contourLines[0] > 22 && opaqueDetection.contourLines[0] < 40);

const adjacentRowsSheet = makeImageData(80, 80, [230, 40, 40, 255]);
paintRect(adjacentRowsSheet, { x: 0, y: 40, width: 80, height: 40 }, [40, 80, 220, 255]);

const adjacentRowsDetection = detectAutoSelectionRows(adjacentRowsSheet);
assert.equal(adjacentRowsDetection.rows.length, 2);
assert.equal(adjacentRowsDetection.contourLines.length, 1);
assert.equal(adjacentRowsDetection.contourLines[0], 40);

const singlePhotoLikeBlock = makeImageData(80, 60, [90, 120, 140, 255]);
const singleDetection = detectAutoSelectionRows(singlePhotoLikeBlock);
assert.equal(singleDetection.rows.length, 0);
assert.equal(singleDetection.contourLines.length, 0);

console.log('image auto-selection tests passed');
