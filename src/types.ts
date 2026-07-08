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
  backgroundRemovedAt?: number; // Present when the cutout has been processed in cleanup/bg removal
  cleanupProcessedAt?: number; // Present when the original source has already been reviewed/processed for cleanup
  derivedFromSegmentId?: string; // Original cutout ID when this segment was created from a cleanup pass
  tags?: string[];
}

export type SelectionTool = 'select' | 'rectangle' | 'lasso' | 'magnetic';

export interface AnimationFrame {
  id: string;
  thumbnailUrl: string; // Transparent PNG of this specific frame
  offsetX: number; // visual nudge X
  offsetY: number; // visual nudge Y
  scale: number; // visual zoom (defaults to 1.0)
  duration: number; // frame duration multiplier or ms
  pivotX?: number; // Pixel pivot from the frame's top-left corner
  pivotY?: number; // Pixel pivot from the frame's top-left corner
  sourceSegmentId?: string; // Original segment ID if sliced
  sliceX?: number; // X coordinate on the original segment image
  sliceY?: number; // Y coordinate on the original segment image
  sliceW?: number; // width of slice on the original segment image
  sliceH?: number; // height of slice on the original segment image
  originalSliceX?: number; // original X coordinate for reset reference
  originalSliceY?: number; // original Y coordinate for reset reference
  originalSliceW?: number; // original width before trim/crop changes
  originalSliceH?: number; // original height before trim/crop changes
  originalPivotX?: number; // original pivot X before user adjustments
  originalPivotY?: number; // original pivot Y before user adjustments
  trimmedBounds?: RectBounds; // Last transparent trim rect applied to this frame
}

export interface AnimationProject {
  id: string;
  name: string;
  frames: AnimationFrame[];
  fps: number;
  loop: boolean;
  width: number; // Playback bounding canvas width
  height: number; // Playback bounding canvas height
  updatedAt?: number;
}

export interface AssetLibraryFile {
  version: number;
  exportedAt: number;
  lastCutoutIndex: number;
  savedSegments: SavedSegment[];
}

export interface AnimationStudioProjectFile {
  version: number;
  exportedAt: number;
  project: AnimationProject;
  selectedSegmentId?: string;
  cols: number;
  rows: number;
  showSubdivisionGrid: boolean;
}

export type CollageBackground = {
  mode: 'transparent' | 'solid';
  color: string;
};

export type CollageItemKind = 'image' | 'text' | 'shape';
export type CollageBlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';
export type CollageTextAlign = 'left' | 'center' | 'right';
export type CollageShapeKind = 'rectangle' | 'circle';

export interface CollageItem {
  id: string;
  name: string;
  kind?: CollageItemKind;
  sourceSegmentId?: string | null;
  thumbnailUrl: string;
  originalWidth: number;
  originalHeight: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  flipX: boolean;
  flipY: boolean;
  locked: boolean;
  visible: boolean;
  blendMode?: CollageBlendMode;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  hueRotate?: number;
  text?: string;
  textColor?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  textAlign?: CollageTextAlign;
  shapeKind?: CollageShapeKind;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
}

export interface CollageProject {
  id: string;
  name: string;
  width: number;
  height: number;
  background: CollageBackground;
  items: CollageItem[];
  updatedAt?: number;
}

export interface CollageStudioProjectFile {
  version: number;
  exportedAt: number;
  project: CollageProject;
  selectedItemId?: string | null;
  stageZoom?: number;
}
