import assert from 'node:assert/strict';
import type { SavedSegment } from '../src/types';
import {
  getSegmentCleanupStatus,
  getSegmentCleanupStatusLabel,
  isVisibleForSegmentSourceFilter,
} from '../src/utils/segmentFilters';

const baseSegment: SavedSegment = {
  id: 'seg_1',
  name: 'frame_001.png',
  path: [],
  type: 'rectangle',
  bounds: { x: 0, y: 0, width: 32, height: 32 },
  feather: 0,
  thumbnailUrl: 'data:image/png;base64,abc',
  createdAt: 1,
};

const processedOriginal: SavedSegment = {
  ...baseSegment,
  id: 'seg_processed',
  cleanupProcessedAt: 2,
};

const cleanedFrame: SavedSegment = {
  ...baseSegment,
  id: 'seg_cleaned',
  backgroundRemovedAt: 3,
  cleanupProcessedAt: 3,
  derivedFromSegmentId: 'seg_processed',
};

assert.equal(isVisibleForSegmentSourceFilter(baseSegment, 'all'), true);
assert.equal(isVisibleForSegmentSourceFilter(processedOriginal, 'all'), true);
assert.equal(isVisibleForSegmentSourceFilter(cleanedFrame, 'all'), true);

assert.equal(isVisibleForSegmentSourceFilter(baseSegment, 'needs-cleanup'), true);
assert.equal(isVisibleForSegmentSourceFilter(processedOriginal, 'needs-cleanup'), false);
assert.equal(isVisibleForSegmentSourceFilter(cleanedFrame, 'needs-cleanup'), false);

assert.equal(isVisibleForSegmentSourceFilter(baseSegment, 'cleaned'), false);
assert.equal(isVisibleForSegmentSourceFilter(processedOriginal, 'cleaned'), false);
assert.equal(isVisibleForSegmentSourceFilter(cleanedFrame, 'cleaned'), true);

assert.equal(getSegmentCleanupStatus(baseSegment), 'needs-cleanup');
assert.equal(getSegmentCleanupStatus(processedOriginal), 'reviewed');
assert.equal(getSegmentCleanupStatus(cleanedFrame), 'cleaned');
assert.equal(getSegmentCleanupStatusLabel(baseSegment), 'Needs Cleanup');
assert.equal(getSegmentCleanupStatusLabel(processedOriginal), 'Reviewed');
assert.equal(getSegmentCleanupStatusLabel(cleanedFrame), 'Cleaned');

console.log('segment filter tests passed');
