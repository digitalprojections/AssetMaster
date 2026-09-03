import assert from 'node:assert/strict';
import {
  MAX_VIDEO_FRAME_FPS,
  MAX_VIDEO_FRAME_COUNT,
  MIN_VIDEO_FRAME_FPS,
  createVideoFrameCutoutSegment,
  getVideoFrameCount,
  getVideoFrameCaptureTimes,
  normalizeVideoFrameCollectionName,
  normalizeVideoFrameFps,
  validateVideoFrameSourceDuration,
} from '../src/utils/videoFrames';

assert.equal(normalizeVideoFrameFps(1), MIN_VIDEO_FRAME_FPS);
assert.equal(normalizeVideoFrameFps(12.4), 12);
assert.equal(normalizeVideoFrameFps(120), MAX_VIDEO_FRAME_FPS);
assert.equal(normalizeVideoFrameFps(Number.NaN), MIN_VIDEO_FRAME_FPS);

assert.doesNotThrow(() => validateVideoFrameSourceDuration(3));
assert.throws(() => validateVideoFrameSourceDuration(3.2), /3 seconds or shorter/);
assert.throws(() => validateVideoFrameSourceDuration(0), /readable duration/);

const fiveFpsTimes = getVideoFrameCaptureTimes(3, 5);
assert.equal(fiveFpsTimes.length, 15);
assert.equal(fiveFpsTimes[0], 0);
assert.equal(fiveFpsTimes[14], 2.8);

const highFpsTimes = getVideoFrameCaptureTimes(3, 240);
assert.equal(highFpsTimes.length, MAX_VIDEO_FRAME_COUNT);
assert.ok(highFpsTimes.every((time) => time < 3));

const partialSecondTimes = getVideoFrameCaptureTimes(1.01, 5);
assert.equal(partialSecondTimes.length, 6);
assert.equal(partialSecondTimes[5], 1);
assert.equal(getVideoFrameCount(2, 8), 16);
assert.equal(normalizeVideoFrameCollectionName('Hero Walk.mov'), 'Hero_Walk');
assert.equal(normalizeVideoFrameCollectionName('***.mp4'), 'video_frames');

const frameCutout = createVideoFrameCutoutSegment({
  thumbnailUrl: 'data:image/png;base64,abc',
  width: 320,
  height: 180,
  collectionId: 'collection_1',
  collectionName: 'walk_cycle',
  index: 2,
  count: 9,
  createdAt: 123,
});
assert.equal(frameCutout.id, 'seg_collection_1_2');
assert.equal(frameCutout.name, 'walk_cycle_frame_003.png');
assert.equal(frameCutout.collectionIndex, 3);
assert.equal(frameCutout.collectionCount, 9);
assert.deepEqual(frameCutout.tags, ['video frame', 'walk_cycle']);
assert.equal(frameCutout.bounds.width, 320);

console.log('video frame conversion tests passed');
