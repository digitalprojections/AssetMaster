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
  validateVideoFrameRange,
  validateVideoFrameFileSize,
  getVideoFrameOutputSize,
  validateVideoFrameSourceDimensions,
} from '../src/utils/videoFrames';

assert.equal(normalizeVideoFrameFps(1), MIN_VIDEO_FRAME_FPS);
assert.equal(normalizeVideoFrameFps(12.4), 12);
assert.equal(normalizeVideoFrameFps(120), MAX_VIDEO_FRAME_FPS);
assert.equal(normalizeVideoFrameFps(Number.NaN), MIN_VIDEO_FRAME_FPS);

assert.doesNotThrow(() => validateVideoFrameSourceDuration(3));
assert.doesNotThrow(() => validateVideoFrameSourceDuration(600));
assert.throws(() => validateVideoFrameSourceDuration(600.1), /600 seconds/);
assert.throws(() => validateVideoFrameSourceDuration(0), /readable duration/);
assert.throws(() => validateVideoFrameSourceDuration(Infinity), /readable duration/);
assert.doesNotThrow(() => validateVideoFrameFileSize(250 * 1024 * 1024));
assert.throws(() => validateVideoFrameFileSize(250 * 1024 * 1024 + 1), /250 MiB/);
assert.doesNotThrow(() => validateVideoFrameRange(600, 590, 600, 5));
assert.throws(() => validateVideoFrameRange(600, 0, 10.1, 5), /10 seconds/);
assert.throws(() => validateVideoFrameRange(600, 590, 600, 30), /90 frames/);
for (const [start, end] of [[-1, 1], [2, 2], [3, 2], [599, 601], [NaN, 2]]) {
  assert.throws(() => validateVideoFrameRange(600, start, end, 5));
}
assert.deepEqual(getVideoFrameCaptureTimes(60, 5, 40, 41), [40, 40.2, 40.4, 40.6, 40.8]);
assert.equal(getVideoFrameCount(600, 5, 590, 600), 50);
assert.equal(getVideoFrameCount(600, 30, 597, 600), 90);
assert.deepEqual(getVideoFrameOutputSize(64, 32, 90), { width: 64, height: 32 });
const boundedSize = getVideoFrameOutputSize(3840, 2160, 90);
assert.ok(boundedSize.width <= 1280);
assert.ok(boundedSize.width * boundedSize.height * 90 <= 32 * 1024 * 1024);
assert.ok(Math.abs(boundedSize.width / boundedSize.height - 16 / 9) < 0.01);
assert.throws(() => getVideoFrameOutputSize(0, 100, 20), /dimensions/);
assert.doesNotThrow(() => validateVideoFrameSourceDimensions(3840, 2160));
assert.doesNotThrow(() => validateVideoFrameSourceDimensions(2160, 3840));
assert.throws(() => validateVideoFrameSourceDimensions(7680, 4320), /4K/);
assert.throws(() => validateVideoFrameSourceDimensions(1, 9000), /4K/);

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
