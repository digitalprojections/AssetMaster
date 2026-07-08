import { Point, RectBounds } from '../types';

export type AxisGuideResult = {
  x: number | null;
  y: number | null;
};

/**
 * Calculates the luminance of an RGB pixel.
 */
function getLuminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Finds a snapped point near the cursor that lies on a high-contrast edge.
 * Uses a Sobel-like gradient magnitude weighted by distance from the cursor.
 */
export function findSnappedPoint(
  ctx: CanvasRenderingContext2D,
  cursor: Point,
  searchRadius: number,
  imageWidth: number,
  imageHeight: number,
  searchBounds?: RectBounds
): Point {
  const boundsMinX = searchBounds ? searchBounds.x : 0;
  const boundsMinY = searchBounds ? searchBounds.y : 0;
  const boundsMaxX = searchBounds ? searchBounds.x + searchBounds.width : imageWidth;
  const boundsMaxY = searchBounds ? searchBounds.y + searchBounds.height : imageHeight;

  // Ensure we stay within both image bounds and the requested search bounds
  const startX = Math.max(0, boundsMinX, Math.floor(cursor.x - searchRadius));
  const startY = Math.max(0, boundsMinY, Math.floor(cursor.y - searchRadius));
  const endX = Math.min(imageWidth - 1, Math.ceil(boundsMaxX) - 1, Math.ceil(cursor.x + searchRadius));
  const endY = Math.min(imageHeight - 1, Math.ceil(boundsMaxY) - 1, Math.ceil(cursor.y + searchRadius));

  const width = endX - startX + 1;
  const height = endY - startY + 1;

  if (width <= 0 || height <= 0) return cursor;

  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(startX, startY, width, height);
  } catch (e) {
    // Fallback if security/CORS issue or out of bounds
    return cursor;
  }

  const data = imgData.data;

  // Helper to get luminance of a relative pixel
  const getL = (rx: number, ry: number): number => {
    if (rx < 0 || rx >= width || ry < 0 || ry >= height) return 0;
    const idx = (ry * width + rx) * 4;
    return getLuminance(data[idx], data[idx + 1], data[idx + 2]);
  };

  let maxScore = -1;
  let bestPoint: Point = { ...cursor };

  // Scan the neighborhood
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Calculate Sobel gradient magnitude
      const gx =
        -1 * getL(x - 1, y - 1) +
        1 * getL(x + 1, y - 1) +
        -2 * getL(x - 1, y) +
        2 * getL(x + 1, y) +
        -1 * getL(x - 1, y + 1) +
        1 * getL(x + 1, y + 1);

      const gy =
        -1 * getL(x - 1, y - 1) +
        -2 * getL(x, y - 1) +
        -1 * getL(x + 1, y - 1) +
        1 * getL(x - 1, y + 1) +
        2 * getL(x, y + 1) +
        1 * getL(x + 1, y + 1);

      const gradMag = Math.sqrt(gx * gx + gy * gy);

      // Map back to global image coordinates
      const globalX = startX + x;
      const globalY = startY + y;

      // Distance from current cursor
      const dx = globalX - cursor.x;
      const dy = globalY - cursor.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Weight score by distance to keep it snapped near the mouse
      const distanceWeight = Math.max(0, 1 - dist / (searchRadius * 1.2));
      const score = gradMag * distanceWeight;

      if (score > maxScore) {
        maxScore = score;
        bestPoint = { x: globalX, y: globalY };
      }
    }
  }

  // Only snap if we found a reasonable edge, otherwise return original cursor
  return maxScore > 10 ? bestPoint : cursor;
}

/**
 * Finds likely vertical/horizontal straight-edge guides near the cursor.
 * Scores local columns and rows by aggregated gradient strength so zoomed-in
 * viewport snapping can lock onto visible object edges and intersections.
 */
export function findAxisSnapGuides(
  ctx: CanvasRenderingContext2D,
  cursor: Point,
  searchRadius: number,
  imageWidth: number,
  imageHeight: number,
  searchBounds?: RectBounds
): AxisGuideResult {
  const boundsMinX = searchBounds ? searchBounds.x : 0;
  const boundsMinY = searchBounds ? searchBounds.y : 0;
  const boundsMaxX = searchBounds ? searchBounds.x + searchBounds.width : imageWidth;
  const boundsMaxY = searchBounds ? searchBounds.y + searchBounds.height : imageHeight;

  const startX = Math.max(0, boundsMinX, Math.floor(cursor.x - searchRadius));
  const startY = Math.max(0, boundsMinY, Math.floor(cursor.y - searchRadius));
  const endX = Math.min(imageWidth - 1, Math.ceil(boundsMaxX) - 1, Math.ceil(cursor.x + searchRadius));
  const endY = Math.min(imageHeight - 1, Math.ceil(boundsMaxY) - 1, Math.ceil(cursor.y + searchRadius));

  const width = endX - startX + 1;
  const height = endY - startY + 1;

  if (width <= 2 || height <= 2) {
    return { x: null, y: null };
  }

  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(startX, startY, width, height);
  } catch (e) {
    return { x: null, y: null };
  }

  const data = imgData.data;
  const luminance = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      luminance[y * width + x] = getLuminance(data[idx], data[idx + 1], data[idx + 2]);
    }
  }

  const getL = (x: number, y: number): number => {
    const rx = clamp(x, 0, width - 1);
    const ry = clamp(y, 0, height - 1);
    return luminance[ry * width + rx];
  };

  let bestXScore = 0;
  let bestYScore = 0;
  let bestX: number | null = null;
  let bestY: number | null = null;

  for (let x = 1; x < width - 1; x++) {
    let edgeStrength = 0;
    for (let y = 1; y < height - 1; y++) {
      const gx = getL(x + 1, y) - getL(x - 1, y);
      edgeStrength += Math.abs(gx);
    }

    const globalX = startX + x;
    const distanceWeight = Math.max(0, 1 - Math.abs(globalX - cursor.x) / (searchRadius * 1.25));
    const score = edgeStrength * distanceWeight;
    if (score > bestXScore) {
      bestXScore = score;
      bestX = globalX;
    }
  }

  for (let y = 1; y < height - 1; y++) {
    let edgeStrength = 0;
    for (let x = 1; x < width - 1; x++) {
      const gy = getL(x, y + 1) - getL(x, y - 1);
      edgeStrength += Math.abs(gy);
    }

    const globalY = startY + y;
    const distanceWeight = Math.max(0, 1 - Math.abs(globalY - cursor.y) / (searchRadius * 1.25));
    const score = edgeStrength * distanceWeight;
    if (score > bestYScore) {
      bestYScore = score;
      bestY = globalY;
    }
  }

  const minXScore = height * 12;
  const minYScore = width * 12;

  return {
    x: bestXScore >= minXScore ? bestX : null,
    y: bestYScore >= minYScore ? bestY : null,
  };
}

/**
 * Creates a cropped transparent PNG data URL of the image within the specified path.
 * Supports feathering using canvas blur filters.
 */
export function createSegmentImage(
  image: HTMLImageElement,
  path: Point[],
  bounds: RectBounds,
  feather: number
): string {
  const canvas = document.createElement('canvas');
  // Add some padding if feathered to avoid cutting off soft blurred edges
  const pad = Math.ceil(feather * 1.5);
  canvas.width = Math.max(1, bounds.width + pad * 2);
  canvas.height = Math.max(1, bounds.height + pad * 2);

  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Create a mask canvas of the same size
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;
  const maskCtx = maskCanvas.getContext('2d');
  if (!maskCtx) return '';

  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

  // Draw the selection path on the mask canvas (offset by bounds and padding)
  maskCtx.fillStyle = '#ffffff';
  maskCtx.beginPath();
  if (path.length > 0) {
    maskCtx.moveTo(path[0].x - bounds.x + pad, path[0].y - bounds.y + pad);
    for (let i = 1; i < path.length; i++) {
      maskCtx.lineTo(path[i].x - bounds.x + pad, path[i].y - bounds.y + pad);
    }
    maskCtx.closePath();
    maskCtx.fill();
  }

  // 2. If feather is requested, blur the mask
  if (feather > 0) {
    const blurCanvas = document.createElement('canvas');
    blurCanvas.width = canvas.width;
    blurCanvas.height = canvas.height;
    const blurCtx = blurCanvas.getContext('2d');
    if (blurCtx) {
      blurCtx.clearRect(0, 0, blurCanvas.width, blurCanvas.height);
      blurCtx.filter = `blur(${feather}px)`;
      blurCtx.drawImage(maskCanvas, 0, 0);
      // Replace maskCtx with blurred mask
      maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      maskCtx.drawImage(blurCanvas, 0, 0);
    }
  }

  // 3. Draw original image onto output canvas
  // First draw the mask
  ctx.drawImage(maskCanvas, 0, 0);

  // Then composite the image using 'source-in'
  ctx.globalCompositeOperation = 'source-in';
  ctx.drawImage(
    image,
    bounds.x - pad,
    bounds.y - pad,
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return canvas.toDataURL('image/png');
}

/**
 * Helper to calculate bounds of a polygon path
 */
export function getPathBounds(path: Point[], imageWidth: number, imageHeight: number): RectBounds {
  if (path.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of path) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  // Snap to integer pixels and clamp to image dimensions
  const x = Math.max(0, Math.floor(minX));
  const y = Math.max(0, Math.floor(minY));
  const w = Math.min(imageWidth - x, Math.ceil(maxX - minX));
  const h = Math.min(imageHeight - y, Math.ceil(maxY - minY));

  return { x, y, width: w, height: h };
}
