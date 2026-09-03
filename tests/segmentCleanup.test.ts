import assert from 'node:assert/strict';
import type { SavedSegment } from '../src/types';
import { saveCleanedSegmentResult } from '../src/utils/segmentCleanup';

const makeSegment = (overrides: Partial<SavedSegment> = {}): SavedSegment => ({
  id: 'seg_original',
  name: 'frame_001.png',
  path: [],
  type: 'rectangle',
  bounds: { x: 0, y: 0, width: 32, height: 32 },
  feather: 0,
  thumbnailUrl: 'data:image/png;base64,original',
  createdAt: 1,
  tags: ['walk'],
  ...overrides,
});

const original = makeSegment();
const firstClean = saveCleanedSegmentResult({
  segments: [original],
  sourceSegment: original,
  updatedUrl: 'data:image/png;base64,cleaned',
  timestamp: 10,
  createSegmentId: () => 'seg_cleaned',
  createSegmentName: () => 'frame_001_cleaned.png',
});

assert.equal(firstClean.mode, 'created');
assert.equal(firstClean.savedSegment.id, 'seg_cleaned');
assert.equal(firstClean.savedSegment.thumbnailUrl, 'data:image/png;base64,cleaned');
assert.equal(firstClean.savedSegment.derivedFromSegmentId, 'seg_original');
assert.equal(firstClean.nextSegments.length, 2);
assert.equal(firstClean.nextSegments[1].cleanupProcessedAt, 10);

const cleanedFrame = makeSegment({
  id: 'seg_cleaned',
  name: 'frame_001_cleaned.png',
  thumbnailUrl: 'data:image/png;base64,cleaned',
  backgroundRemovedAt: 10,
  cleanupProcessedAt: 10,
  derivedFromSegmentId: 'seg_original',
  collectionId: 'collection_1',
  collectionName: 'walk_cycle',
  collectionIndex: 1,
  collectionCount: 8,
});

const refinedClean = saveCleanedSegmentResult({
  segments: [cleanedFrame, original],
  sourceSegment: cleanedFrame,
  updatedUrl: 'data:image/png;base64,refined',
  timestamp: 20,
  createSegmentId: () => 'unused',
  createSegmentName: () => 'unused.png',
});

assert.equal(refinedClean.mode, 'updated');
assert.equal(refinedClean.savedSegment.id, 'seg_cleaned');
assert.equal(refinedClean.savedSegment.name, 'frame_001_cleaned.png');
assert.equal(refinedClean.savedSegment.thumbnailUrl, 'data:image/png;base64,refined');
assert.equal(refinedClean.savedSegment.backgroundRemovedAt, 20);
assert.equal(refinedClean.savedSegment.cleanupProcessedAt, 20);
assert.equal(refinedClean.savedSegment.collectionId, 'collection_1');
assert.equal(refinedClean.nextSegments.length, 2);
assert.equal(refinedClean.nextSegments[0].id, 'seg_cleaned');
assert.equal(refinedClean.nextSegments[0].thumbnailUrl, 'data:image/png;base64,refined');

console.log('segment cleanup tests passed');
