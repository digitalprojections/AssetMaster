import type { RectBounds } from '../types';

export type AutoSelectionRow = {
  index: number;
  bounds: RectBounds;
  centerY: number;
};

export type AutoSelectionRowDetection = {
  width: number;
  height: number;
  rows: AutoSelectionRow[];
  contourLines: number[];
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const colorDistance = (
  r: number,
  g: number,
  b: number,
  color: { r: number; g: number; b: number }
) => Math.sqrt((r - color.r) ** 2 + (g - color.g) ** 2 + (b - color.b) ** 2);

const sampleCornerBackground = (data: Uint8ClampedArray, width: number, height: number) => {
  const sampleSize = Math.max(1, Math.min(8, Math.floor(Math.min(width, height) / 10)));
  const samples: Array<[number, number]> = [];

  for (let y = 0; y < sampleSize; y += 1) {
    for (let x = 0; x < sampleSize; x += 1) {
      samples.push([x, y], [width - 1 - x, y], [x, height - 1 - y], [width - 1 - x, height - 1 - y]);
    }
  }

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  samples.forEach(([x, y]) => {
    const idx = (y * width + x) * 4;
    const alpha = data[idx + 3];
    if (alpha <= 16) {
      return;
    }

    r += data[idx];
    g += data[idx + 1];
    b += data[idx + 2];
    count += 1;
  });

  if (count === 0) {
    return { r: 255, g: 255, b: 255 };
  }

  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  };
};

const buildRowActivity = (imageData: ImageData): number[] => {
  const { data, width, height } = imageData;
  const transparentPixels = (() => {
    let count = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] <= 16) {
        count += 1;
      }
    }
    return count;
  })();
  const usesTransparency = transparentPixels / (width * height) > 0.04;
  const background = sampleCornerBackground(data, width, height);
  const activity: number[] = [];

  for (let y = 0; y < height; y += 1) {
    let activePixels = 0;

    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha <= 16) {
        continue;
      }

      if (usesTransparency) {
        activePixels += 1;
        continue;
      }

      if (colorDistance(data[idx], data[idx + 1], data[idx + 2], background) > 34) {
        activePixels += 1;
      }
    }

    activity.push(activePixels / width);
  }

  return activity;
};

const smoothActivity = (activity: number[], radius: number): number[] => {
  return activity.map((_, index) => {
    let sum = 0;
    let count = 0;
    const start = Math.max(0, index - radius);
    const end = Math.min(activity.length - 1, index + radius);

    for (let i = start; i <= end; i += 1) {
      sum += activity[i];
      count += 1;
    }

    return count > 0 ? sum / count : 0;
  });
};

const mergeCloseBands = (
  bands: Array<{ start: number; end: number }>,
  maxGap: number
): Array<{ start: number; end: number }> => {
  if (bands.length === 0) {
    return [];
  }

  const merged = [bands[0]];
  for (let i = 1; i < bands.length; i += 1) {
    const previous = merged[merged.length - 1];
    const current = bands[i];

    if (current.start - previous.end <= maxGap) {
      previous.end = current.end;
    } else {
      merged.push(current);
    }
  }

  return merged;
};

export const detectAutoSelectionRows = (imageData: ImageData): AutoSelectionRowDetection => {
  const { width, height } = imageData;
  const emptyResult = { width, height, rows: [], contourLines: [] };
  if (width <= 0 || height <= 0) {
    return emptyResult;
  }

  const activity = smoothActivity(buildRowActivity(imageData), Math.max(1, Math.round(height / 160)));
  const strongestRow = Math.max(...activity);
  if (strongestRow < 0.015) {
    return emptyResult;
  }

  const threshold = clamp(strongestRow * 0.2, 0.012, 0.18);
  const rawBands: Array<{ start: number; end: number }> = [];
  let bandStart: number | null = null;

  activity.forEach((value, y) => {
    if (value >= threshold && bandStart === null) {
      bandStart = y;
    }

    if ((value < threshold || y === activity.length - 1) && bandStart !== null) {
      const end = value < threshold ? y - 1 : y;
      rawBands.push({ start: bandStart, end });
      bandStart = null;
    }
  });

  const minBandHeight = Math.max(3, Math.round(height * 0.025));
  const mergedBands = mergeCloseBands(rawBands, Math.max(2, Math.round(height * 0.01)))
    .filter((band) => band.end - band.start + 1 >= minBandHeight);

  if (mergedBands.length <= 1) {
    return emptyResult;
  }

  const contourLines = mergedBands.slice(0, -1).map((band, index) => (
    Math.round((band.end + mergedBands[index + 1].start) / 2)
  ));
  const rowEdges = [0, ...contourLines, height];

  const rows = rowEdges.slice(0, -1).map((start, index) => {
    const end = rowEdges[index + 1];
    return {
      index,
      bounds: {
        x: 0,
        y: start,
        width,
        height: Math.max(1, end - start),
      },
      centerY: start + (end - start) / 2,
    };
  });

  return {
    width,
    height,
    rows,
    contourLines,
  };
};

export const getAutoSelectionRowAtPoint = (
  detection: AutoSelectionRowDetection,
  point: { x: number; y: number }
): AutoSelectionRow | null => {
  if (point.x < 0 || point.x > detection.width || point.y < 0 || point.y > detection.height) {
    return null;
  }

  return detection.rows.find((row) => (
    point.y >= row.bounds.y &&
    point.y <= row.bounds.y + row.bounds.height
  )) ?? null;
};
