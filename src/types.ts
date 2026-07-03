export interface Point {
  x: number;
  y: number;
}

export interface RectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SavedSegment {
  id: string;
  name: string;
  path: Point[]; // Closed polygon path in raw image coordinate space
  type: 'rectangle' | 'lasso' | 'magnetic';
  bounds: RectBounds; // Bounding box of the segment
  feather: number; // Feather radius in pixels
  thumbnailUrl: string; // Transparent PNG data URL
  createdAt: number;
}

export type SelectionTool = 'select' | 'rectangle' | 'lasso' | 'magnetic';

export interface AnimationFrame {
  id: string;
  thumbnailUrl: string; // Transparent PNG of this specific frame
  offsetX: number; // visual nudge X
  offsetY: number; // visual nudge Y
  scale: number; // visual zoom (defaults to 1.0)
  duration: number; // frame duration multiplier or ms
  sourceSegmentId?: string; // Original segment ID if sliced
  sliceX?: number; // X coordinate on the original segment image
  sliceY?: number; // Y coordinate on the original segment image
  sliceW?: number; // width of slice on the original segment image
  sliceH?: number; // height of slice on the original segment image
  originalSliceX?: number; // original X coordinate for reset reference
  originalSliceY?: number; // original Y coordinate for reset reference
}

export interface AnimationProject {
  id: string;
  name: string;
  frames: AnimationFrame[];
  fps: number;
  loop: boolean;
  width: number; // Playback bounding canvas width
  height: number; // Playback bounding canvas height
}
