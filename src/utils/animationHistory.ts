import type { AnimationProject } from '../types';

export const ANIMATION_HISTORY_LIMIT = 50;

export type AnimationProjectSnapshot = {
  project: AnimationProject;
  activeFrameIndex: number;
};

export type AnimationProjectHistory = {
  past: AnimationProjectSnapshot[];
  future: AnimationProjectSnapshot[];
};

export const createAnimationProjectHistory = (): AnimationProjectHistory => ({
  past: [],
  future: [],
});

export const pushAnimationProjectHistory = (
  history: AnimationProjectHistory,
  snapshot: AnimationProjectSnapshot,
  limit = ANIMATION_HISTORY_LIMIT
): AnimationProjectHistory => ({
  past: [...history.past, snapshot].slice(-limit),
  future: [],
});

export const undoAnimationProjectHistory = (
  history: AnimationProjectHistory,
  current: AnimationProjectSnapshot
): { history: AnimationProjectHistory; snapshot: AnimationProjectSnapshot } | null => {
  const snapshot = history.past[history.past.length - 1];
  if (!snapshot) {
    return null;
  }

  return {
    snapshot,
    history: {
      past: history.past.slice(0, -1),
      future: [current, ...history.future],
    },
  };
};

export const redoAnimationProjectHistory = (
  history: AnimationProjectHistory,
  current: AnimationProjectSnapshot
): { history: AnimationProjectHistory; snapshot: AnimationProjectSnapshot } | null => {
  const snapshot = history.future[0];
  if (!snapshot) {
    return null;
  }

  return {
    snapshot,
    history: {
      past: [...history.past, current].slice(-ANIMATION_HISTORY_LIMIT),
      future: history.future.slice(1),
    },
  };
};

export const getActiveFrameIndexAfterFrameRemoval = (
  frameCount: number,
  activeFrameIndex: number,
  removedFrameIndex: number
): number => {
  const nextFrameCount = Math.max(0, frameCount - 1);
  if (nextFrameCount === 0) {
    return 0;
  }

  if (activeFrameIndex > removedFrameIndex) {
    return activeFrameIndex - 1;
  }

  return Math.min(activeFrameIndex, nextFrameCount - 1);
};
