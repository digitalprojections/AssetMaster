import type { AnimationEraseStroke, Point } from '../types';

export const MIN_FRAME_ERASER_RADIUS = 2;
export const MAX_FRAME_ERASER_RADIUS = 64;

export const clampFrameEraserRadius = (radius: number): number => {
  if (!Number.isFinite(radius)) {
    return 12;
  }

  return Math.max(MIN_FRAME_ERASER_RADIUS, Math.min(MAX_FRAME_ERASER_RADIUS, Math.round(radius)));
};

export const createAnimationEraseStroke = (
  points: Point[],
  radius: number,
  id = `erase_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
): AnimationEraseStroke => ({
  id,
  points: points.map((point) => ({
    x: Math.round(point.x),
    y: Math.round(point.y),
  })),
  radius: clampFrameEraserRadius(radius),
});

export const appendPointToEraseStroke = (
  points: Point[],
  point: Point,
  minDistance = 0.5
): Point[] => {
  const lastPoint = points[points.length - 1];
  if (lastPoint && Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < minDistance) {
    return points;
  }

  return [...points, point];
};
