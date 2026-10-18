import type { SavedSegment } from '../types';

export const MAX_VIDEO_FRAME_SOURCE_SECONDS = 600;
export const MAX_VIDEO_FRAME_RANGE_SECONDS = 10;
export const MAX_VIDEO_FRAME_FILE_BYTES = 250 * 1024 * 1024;
export const MAX_VIDEO_FRAME_ENCODED_BYTES = 48 * 1024 * 1024;
export const MIN_VIDEO_FRAME_FPS = 5;
export const MAX_VIDEO_FRAME_FPS = 30;
export const MAX_VIDEO_FRAME_COUNT = 90;

export const normalizeVideoFrameFps = (fps: number): number => {
  if (!Number.isFinite(fps)) {
    return MIN_VIDEO_FRAME_FPS;
  }

  return Math.min(MAX_VIDEO_FRAME_FPS, Math.max(MIN_VIDEO_FRAME_FPS, Math.round(fps)));
};

export const validateVideoFrameSourceDuration = (durationSeconds: number): void => {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error('Choose a video with a readable duration.');
  }

  if (durationSeconds > MAX_VIDEO_FRAME_SOURCE_SECONDS) {
    throw new Error(`Videos must be ${MAX_VIDEO_FRAME_SOURCE_SECONDS} seconds or shorter.`);
  }
};

export const validateVideoFrameFileSize = (bytes: number): void => {
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_VIDEO_FRAME_FILE_BYTES) {
    throw new Error('Choose a video no larger than 250 MiB.');
  }
};

export const validateVideoFrameSourceDimensions = (width: number, height: number): void => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('The video dimensions could not be read.');
  }
  if (Math.max(width, height) > 4096 || width * height > 3840 * 2160) {
    throw new Error('Choose a video within 4K dimensions (up to 3840 × 2160 pixels, in either orientation).');
  }
};

export const validateVideoFrameRange = (duration: number, start: number, end: number, fps: number): void => {
  validateVideoFrameSourceDuration(duration);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > duration || end <= start) {
    throw new Error('Choose an end time after the start time, within the video.');
  }
  if (end - start > MAX_VIDEO_FRAME_RANGE_SECONDS + 1e-9) {
    throw new Error(`Select a range of ${MAX_VIDEO_FRAME_RANGE_SECONDS} seconds or less.`);
  }
  if (Math.ceil((end - start) * normalizeVideoFrameFps(fps) - 1e-9) > MAX_VIDEO_FRAME_COUNT) {
    throw new Error(`Select fewer seconds or lower the frame rate to stay within ${MAX_VIDEO_FRAME_COUNT} frames.`);
  }
};

export const getVideoFrameOutputSize = (width: number, height: number, count: number): { width: number; height: number } => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('The video dimensions could not be read.');
  }
  if (!Number.isInteger(count) || count < 1 || count > MAX_VIDEO_FRAME_COUNT) {
    throw new Error('The frame count is outside the supported range.');
  }
  // Bound retained decoded RGBA pixels to 128 MiB, before browser/PNG overhead.
  const scale = Math.min(1, 1280 / Math.max(width, height), Math.sqrt(32 * 1024 * 1024 / (width * height * count)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
};

export const getVideoFrameCaptureTimes = (durationSeconds: number, fps: number, start = 0, end = durationSeconds): number[] => {
  validateVideoFrameSourceDuration(durationSeconds);
  validateVideoFrameRange(durationSeconds, start, end, fps);

  const normalizedFps = normalizeVideoFrameFps(fps);
  const frameCount = Math.max(1, Math.ceil((end - start) * normalizedFps - 1e-9));
  const lastSafeTime = Math.max(start, end - Math.min(0.001, (end - start) / 2));

  return Array.from({ length: frameCount }, (_, index) => Math.min(start + index / normalizedFps, lastSafeTime));
};

export const getVideoFrameCount = (durationSeconds: number, fps: number, start = 0, end = durationSeconds): number => (
  getVideoFrameCaptureTimes(durationSeconds, fps, start, end).length
);

export const normalizeVideoFrameCollectionName = (filename: string): string => {
  const bareName = filename.replace(/\.[^.]+$/, '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
  return bareName || 'video_frames';
};

export const createVideoFrameCutoutSegment = ({
  thumbnailUrl,
  width,
  height,
  collectionId,
  collectionName,
  index,
  count,
  createdAt,
}: {
  thumbnailUrl: string;
  width: number;
  height: number;
  collectionId: string;
  collectionName: string;
  index: number;
  count: number;
  createdAt: number;
}): SavedSegment => ({
  id: `seg_${collectionId}_${index}`,
  name: `${collectionName}_frame_${String(index + 1).padStart(3, '0')}.png`,
  path: [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ],
  type: 'rectangle',
  bounds: { x: 0, y: 0, width, height },
  feather: 0,
  thumbnailUrl,
  createdAt,
  inputSourceId: collectionId,
  inputSourceName: collectionName,
  inputSourceType: 'video',
  collectionId,
  collectionName,
  collectionIndex: index + 1,
  collectionCount: count,
  tags: ['video frame', collectionName],
});
