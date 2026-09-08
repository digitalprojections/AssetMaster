import type { AnimationEraseStroke, Point } from '../types';

export const MIN_FRAME_ERASER_RADIUS = 2;
export const MAX_FRAME_ERASER_RADIUS = 64;

type EraseStrokeSourceSlice = {
  sliceX?: number;
  sliceY?: number;
};

type RenderedFrameRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ImageSize = {
  width: number;
  height: number;
};

export const clampFrameEraserRadius = (radius: number): number => {
  if (!Number.isFinite(radius)) {
    return 12;
  }

  return Math.max(MIN_FRAME_ERASER_RADIUS, Math.min(MAX_FRAME_ERASER_RADIUS, Math.round(radius)));
};

export const createAnimationEraseStroke = (
  points: Point[],
  radius: number,
  id = `erase_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  sourceSlice: EraseStrokeSourceSlice = {},
  shape: AnimationEraseStroke['shape'] = 'brush'
): AnimationEraseStroke => {
  const stroke: AnimationEraseStroke = {
    id,
    points: points.map((point) => ({
      x: Math.round(point.x),
      y: Math.round(point.y),
    })),
    radius: clampFrameEraserRadius(radius),
    shape,
  };

  if (typeof sourceSlice.sliceX === 'number' && Number.isFinite(sourceSlice.sliceX)) {
    stroke.sourceSliceX = Math.round(sourceSlice.sliceX);
  }
  if (typeof sourceSlice.sliceY === 'number' && Number.isFinite(sourceSlice.sliceY)) {
    stroke.sourceSliceY = Math.round(sourceSlice.sliceY);
  }

  return stroke;
};

export const createSquareEraseSelectionPoints = (
  startPoint: Point,
  currentPoint: Point,
  minimumSize = 1
): Point[] => {
  const deltaX = currentPoint.x - startPoint.x;
  const deltaY = currentPoint.y - startPoint.y;
  const size = Math.max(Math.abs(deltaX), Math.abs(deltaY), minimumSize);
  const directionX = deltaX < 0 ? -1 : 1;
  const directionY = deltaY < 0 ? -1 : 1;

  return [
    startPoint,
    {
      x: startPoint.x + directionX * size,
      y: startPoint.y + directionY * size,
    },
  ];
};

export const getSquareEraseBounds = (
  stroke: AnimationEraseStroke,
  currentSlice: EraseStrokeSourceSlice = {}
) => {
  const adjustedPoints = getAdjustedEraseStrokePoints(stroke, currentSlice);
  if (adjustedPoints.length === 0) {
    return null;
  }

  const startPoint = adjustedPoints[0];
  const endPoint = adjustedPoints[1] ?? {
    x: startPoint.x + stroke.radius,
    y: startPoint.y + stroke.radius,
  };

  return {
    x: Math.min(startPoint.x, endPoint.x),
    y: Math.min(startPoint.y, endPoint.y),
    width: Math.abs(endPoint.x - startPoint.x),
    height: Math.abs(endPoint.y - startPoint.y),
  };
};

export const getAdjustedEraseStrokePoints = (
  stroke: AnimationEraseStroke,
  currentSlice: EraseStrokeSourceSlice = {}
): Point[] => {
  const offsetX = typeof stroke.sourceSliceX === 'number' &&
    Number.isFinite(stroke.sourceSliceX) &&
    typeof currentSlice.sliceX === 'number' &&
    Number.isFinite(currentSlice.sliceX)
    ? stroke.sourceSliceX - currentSlice.sliceX
    : 0;
  const offsetY = typeof stroke.sourceSliceY === 'number' &&
    Number.isFinite(stroke.sourceSliceY) &&
    typeof currentSlice.sliceY === 'number' &&
    Number.isFinite(currentSlice.sliceY)
    ? stroke.sourceSliceY - currentSlice.sliceY
    : 0;

  return stroke.points.map((point) => ({
    x: point.x + offsetX,
    y: point.y + offsetY,
  }));
};

export const getFrameImagePointFromRenderedRect = (
  clientPoint: Point,
  renderedRect: RenderedFrameRect,
  imageSize: ImageSize
): Point | null => {
  if (
    renderedRect.width <= 0 ||
    renderedRect.height <= 0 ||
    imageSize.width <= 0 ||
    imageSize.height <= 0
  ) {
    return null;
  }

  const normalizedX = (clientPoint.x - renderedRect.left) / renderedRect.width;
  const normalizedY = (clientPoint.y - renderedRect.top) / renderedRect.height;
  if (normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1) {
    return null;
  }

  return {
    x: normalizedX * imageSize.width,
    y: normalizedY * imageSize.height,
  };
};

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
