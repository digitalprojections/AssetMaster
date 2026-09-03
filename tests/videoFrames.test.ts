import assert from 'node:assert/strict';
import {
  MAX_VIDEO_FRAME_FPS,
  MIN_VIDEO_FRAME_FPS,
  getVideoFrameCaptureTimes,
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
assert.equal(highFpsTimes.length, 90);
assert.ok(highFpsTimes.every((time) => time < 3));

const partialSecondTimes = getVideoFrameCaptureTimes(1.01, 5);
assert.equal(partialSecondTimes.length, 6);
assert.equal(partialSecondTimes[5], 1);

console.log('video frame conversion tests passed');
