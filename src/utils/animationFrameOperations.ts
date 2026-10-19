import type { AnimationFrame } from '../types';

export const MIN_ANIMATION_FRAME_SCALE = 0.1;
export const MAX_ANIMATION_FRAME_SCALE = 3;
export const MIN_ANIMATION_FRAME_DURATION = 0.1;
export const MAX_ANIMATION_FRAME_DURATION = 120;

export type AnimationLoopRange = {
  startFrameIndex: number;
  endFrameIndex: number;
};

export type AnimationFrameTransformPatch = {
  offsetX?: number;
  offsetY?: number;
  scale?: number;
  flipX?: boolean;
  flipY?: boolean;
  pivotX?: number;
  pivotY?: number;
};

export const clampNumber = (value: number, min: number, max: number, fallback = min): number => {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, value));
};

export const clampAnimationFrameScale = (scale: number): number => (
  clampNumber(scale, MIN_ANIMATION_FRAME_SCALE, MAX_ANIMATION_FRAME_SCALE, 1)
);

export const clampAnimationFrameDuration = (duration: number): number => {
  const clamped = clampNumber(duration, MIN_ANIMATION_FRAME_DURATION, MAX_ANIMATION_FRAME_DURATION, 1);
  return Math.round(clamped * 1000) / 1000;
};

export const clampAnimationFrameIndex = (frameCount: number, index: number): number => {
  if (frameCount <= 0) {
    return 0;
  }

  if (!Number.isFinite(index)) {
    return 0;
  }

  return Math.max(0, Math.min(Math.trunc(index), frameCount - 1));
};

export const normalizeAnimationFrameSelection = (
  indexes: readonly number[],
  frameCount: number
): number[] => {
  if (frameCount <= 0) {
    return [];
  }

  const validIndexes = indexes
    .filter((index) => Number.isInteger(index) && index >= 0 && index < frameCount)
    .sort((a, b) => a - b);

  return Array.from(new Set(validIndexes));
};

export const selectAnimationFrameRange = (
  anchorIndex: number,
  targetIndex: number,
  frameCount: number
): number[] => {
  if (frameCount <= 0) {
    return [];
  }

  const start = clampAnimationFrameIndex(frameCount, anchorIndex);
  const end = clampAnimationFrameIndex(frameCount, targetIndex);
  const lower = Math.min(start, end);
  const upper = Math.max(start, end);

  return Array.from({ length: upper - lower + 1 }, (_, offset) => lower + offset);
};

export const toggleAnimationFrameSelection = (
  selection: readonly number[],
  index: number,
  frameCount: number
): number[] => {
  if (!Number.isInteger(index) || index < 0 || index >= frameCount) {
    return normalizeAnimationFrameSelection(selection, frameCount);
  }

  const selected = new Set(normalizeAnimationFrameSelection(selection, frameCount));
  if (selected.has(index)) {
    selected.delete(index);
  } else {
    selected.add(index);
  }

  return normalizeAnimationFrameSelection(Array.from(selected), frameCount);
};

export const getActiveFrameIndexAfterAnimationFrameRemoval = (
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

export const removeAnimationFrameAt = (
  frames: readonly AnimationFrame[],
  index: number
): AnimationFrame[] => {
  if (!Number.isInteger(index) || index < 0 || index >= frames.length) {
    return [...frames];
  }

  return frames.filter((_, frameIndex) => frameIndex !== index);
};

export const moveAnimationFrame = (
  frames: readonly AnimationFrame[],
  fromIndex: number,
  toIndex: number
): AnimationFrame[] => {
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    fromIndex >= frames.length ||
    toIndex < 0 ||
    toIndex >= frames.length ||
    fromIndex === toIndex
  ) {
    return [...frames];
  }

  const nextFrames = [...frames];
  const [movedFrame] = nextFrames.splice(fromIndex, 1);
  nextFrames.splice(toIndex, 0, movedFrame);
  return nextFrames;
};

export const shiftAnimationFrame = (
  frames: readonly AnimationFrame[],
  index: number,
  direction: 'left' | 'right'
): { frames: AnimationFrame[]; activeFrameIndex: number } => {
  const targetIndex = direction === 'left' ? index - 1 : index + 1;
  return {
    frames: moveAnimationFrame(frames, index, targetIndex),
    activeFrameIndex: clampAnimationFrameIndex(frames.length, targetIndex),
  };
};

const copyEraseStrokes = (frame: AnimationFrame): AnimationFrame['eraseStrokes'] => (
  frame.eraseStrokes?.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((point) => ({ ...point })),
  }))
);

export const duplicateAnimationFrameAt = (
  frames: readonly AnimationFrame[],
  index: number,
  createId: (sourceFrame: AnimationFrame, sourceIndex: number) => string
): { frames: AnimationFrame[]; activeFrameIndex: number } => {
  if (!Number.isInteger(index) || index < 0 || index >= frames.length) {
    return { frames: [...frames], activeFrameIndex: clampAnimationFrameIndex(frames.length, index) };
  }

  const sourceFrame = frames[index];
  const duplicatedFrame: AnimationFrame = {
    ...sourceFrame,
    id: createId(sourceFrame, index),
    eraseStrokes: copyEraseStrokes(sourceFrame),
  };
  const activeFrameIndex = index + 1;
  return {
    frames: [
      ...frames.slice(0, activeFrameIndex),
      duplicatedFrame,
      ...frames.slice(activeFrameIndex),
    ],
    activeFrameIndex,
  };
};

export const setAnimationFrameDuration = (
  frames: readonly AnimationFrame[],
  index: number,
  duration: number
): AnimationFrame[] => {
  if (!Number.isInteger(index) || index < 0 || index >= frames.length) {
    return [...frames];
  }

  return frames.map((frame, frameIndex) => (
    frameIndex === index
      ? { ...frame, duration: clampAnimationFrameDuration(duration) }
      : frame
  ));
};

export const updateSelectedAnimationFrames = (
  frames: readonly AnimationFrame[],
  selection: readonly number[],
  updateFrame: (frame: AnimationFrame, index: number) => AnimationFrame
): AnimationFrame[] => {
  const selectedIndexes = new Set(normalizeAnimationFrameSelection(selection, frames.length));
  if (selectedIndexes.size === 0) {
    return [...frames];
  }

  return frames.map((frame, index) => (
    selectedIndexes.has(index) ? updateFrame(frame, index) : frame
  ));
};

export const applyAnimationFrameTransformPatch = (
  frames: readonly AnimationFrame[],
  selection: readonly number[],
  patch: AnimationFrameTransformPatch
): AnimationFrame[] => (
  updateSelectedAnimationFrames(frames, selection, (frame) => ({
    ...frame,
    offsetX: patch.offsetX ?? frame.offsetX,
    offsetY: patch.offsetY ?? frame.offsetY,
    scale: patch.scale === undefined ? frame.scale : clampAnimationFrameScale(patch.scale),
    flipX: patch.flipX ?? frame.flipX,
    flipY: patch.flipY ?? frame.flipY,
    pivotX: patch.pivotX ?? frame.pivotX,
    pivotY: patch.pivotY ?? frame.pivotY,
  }))
);

export const createAnimationLoopRange = (
  frameCount: number,
  startFrameIndex: number,
  endFrameIndex: number
): AnimationLoopRange | null => {
  if (frameCount <= 0) {
    return null;
  }

  const start = clampAnimationFrameIndex(frameCount, startFrameIndex);
  const end = clampAnimationFrameIndex(frameCount, endFrameIndex);

  return {
    startFrameIndex: Math.min(start, end),
    endFrameIndex: Math.max(start, end),
  };
};

export const getNextAnimationPlaybackFrameIndex = (
  currentFrameIndex: number,
  frameCount: number,
  loop: boolean,
  loopRange: AnimationLoopRange | null = null
): number => {
  if (frameCount <= 0) {
    return 0;
  }

  const range = loopRange ?? createAnimationLoopRange(frameCount, 0, frameCount - 1);
  if (!range) {
    return 0;
  }

  const current = clampAnimationFrameIndex(frameCount, currentFrameIndex);
  if (current < range.startFrameIndex || current > range.endFrameIndex) {
    return range.startFrameIndex;
  }

  if (current < range.endFrameIndex) {
    return current + 1;
  }

  return loop ? range.startFrameIndex : range.endFrameIndex;
};


const cloneAnimationFrame = (frame: AnimationFrame): AnimationFrame => ({
  ...frame,
  eraseStrokes: copyEraseStrokes(frame),
  trimmedBounds: frame.trimmedBounds ? { ...frame.trimmedBounds } : undefined,
});

export function copyAnimationFrames(frames: readonly AnimationFrame[], selection: readonly number[]): AnimationFrame[] {
  return normalizeAnimationFrameSelection(selection, frames.length).map(index => cloneAnimationFrame(frames[index]));
}

export function pasteAnimationFrames(
  frames: readonly AnimationFrame[], clipboard: readonly AnimationFrame[], insertionIndex: number,
  createId: () => string,
): { frames: AnimationFrame[]; insertedIds: string[] } {
  const insertion = Number.isFinite(insertionIndex) ? Math.max(0, Math.min(frames.length, Math.trunc(insertionIndex))) : frames.length;
  const copies = clipboard.map(frame => ({ ...cloneAnimationFrame(frame), id: createId() }));
  return { frames: [...frames.slice(0, insertion), ...copies, ...frames.slice(insertion)], insertedIds: copies.map(frame => frame.id) };
}

// Insertion is a boundary in the original sequence (0 = before first, length = after last).
export function moveSelectedAnimationFrames(
  frames: readonly AnimationFrame[], selection: readonly number[], insertionIndex: number,
): AnimationFrame[] {
  const indexes = normalizeAnimationFrameSelection(selection, frames.length);
  if (!indexes.length || !Number.isInteger(insertionIndex) || insertionIndex < 0 || insertionIndex > frames.length) return [...frames];
  const selected = new Set(indexes);
  const remaining = frames.filter((_, index) => !selected.has(index));
  const insertion = insertionIndex - indexes.filter(index => index < insertionIndex).length;
  return [...remaining.slice(0, insertion), ...indexes.map(index => frames[index]), ...remaining.slice(insertion)];
}

export function reverseSelectedAnimationFrames(frames: readonly AnimationFrame[], selection: readonly number[]): AnimationFrame[] {
  const indexes = normalizeAnimationFrameSelection(selection, frames.length);
  const next = [...frames];
  indexes.forEach((index, position) => { next[index] = frames[indexes[indexes.length - 1 - position]]; });
  return next;
}
