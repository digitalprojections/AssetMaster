import type { SavedSegment } from '../types';

export const MAX_VIDEO_FRAME_SOURCE_SECONDS = 3;
export const MIN_VIDEO_FRAME_FPS = 5;
export const MAX_VIDEO_FRAME_FPS = 30;
export const MAX_VIDEO_FRAME_COUNT = MAX_VIDEO_FRAME_SOURCE_SECONDS * MAX_VIDEO_FRAME_FPS;

const DURATION_EPSILON_SECONDS = 0.01;

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

  if (durationSeconds > MAX_VIDEO_FRAME_SOURCE_SECONDS + DURATION_EPSILON_SECONDS) {
    throw new Error(`Videos must be ${MAX_VIDEO_FRAME_SOURCE_SECONDS} seconds or shorter.`);
  }
};

export const getVideoFrameCaptureTimes = (durationSeconds: number, fps: number): number[] => {
  validateVideoFrameSourceDuration(durationSeconds);

  const normalizedFps = normalizeVideoFrameFps(fps);
  const frameCount = Math.max(1, Math.ceil(durationSeconds * normalizedFps));
  const lastSafeTime = Math.max(0, durationSeconds - 0.001);

  return Array.from({ length: frameCount }, (_, index) => Math.min(index / normalizedFps, lastSafeTime));
};

export const getVideoFrameCount = (durationSeconds: number, fps: number): number => (
  getVideoFrameCaptureTimes(durationSeconds, fps).length
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
  collectionId,
  collectionName,
  collectionIndex: index + 1,
  collectionCount: count,
  tags: ['video frame', collectionName],
});
