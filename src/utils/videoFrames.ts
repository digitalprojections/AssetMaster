export const MAX_VIDEO_FRAME_SOURCE_SECONDS = 3;
export const MIN_VIDEO_FRAME_FPS = 5;
export const MAX_VIDEO_FRAME_FPS = 30;

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
