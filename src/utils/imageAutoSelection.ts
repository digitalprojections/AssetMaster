import type { RectBounds } from '../types';

export type AutoSelectionRow = {
  index: number;
  bounds: RectBounds;
  centerY: number;
};

export type AutoSelectionColumn = {
  index: number;
  bounds: RectBounds;
  centerX: number;
};

export type AutoSelectionCell = {
  index: number;
  rowIndex: number;
  columnIndex: number;
  bounds: RectBounds;
  centerX: number;
  centerY: number;
};

export type AutoSelectionGridDetection = {
  width: number;
  height: number;
  rows: AutoSelectionRow[];
  columns: AutoSelectionColumn[];
  cells: AutoSelectionCell[];
  contourLines: number[];
  horizontalContourLines: number[];
  verticalContourLines: number[];
};

export type AutoSelectionRowDetection = AutoSelectionGridDetection;

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

const buildRowsFromIntervals = (
  width: number,
  intervals: Array<{ start: number; end: number }>
): AutoSelectionRow[] => intervals.map((interval, index) => {
  const height = Math.max(1, interval.end - interval.start + 1);
  return {
    index,
    bounds: {
      x: 0,
      y: interval.start,
      width,
      height,
    },
    centerY: interval.start + height / 2,
  };
});

const buildColumnsFromIntervals = (
  height: number,
  intervals: Array<{ start: number; end: number }>
): AutoSelectionColumn[] => intervals.map((interval, index) => {
  const width = Math.max(1, interval.end - interval.start + 1);
  return {
    index,
    bounds: {
      x: interval.start,
      y: 0,
      width,
      height,
    },
    centerX: interval.start + width / 2,
  };
});

const buildCells = (rows: AutoSelectionRow[], columns: AutoSelectionColumn[]): AutoSelectionCell[] => {
  const cells: AutoSelectionCell[] = [];

  rows.forEach((row) => {
    columns.forEach((column) => {
      cells.push({
        index: cells.length,
        rowIndex: row.index,
        columnIndex: column.index,
        bounds: {
          x: column.bounds.x,
          y: row.bounds.y,
          width: column.bounds.width,
          height: row.bounds.height,
        },
        centerX: column.centerX,
        centerY: row.centerY,
      });
    });
  });

  return cells;
};

const makeDetection = (
  width: number,
  height: number,
  rows: AutoSelectionRow[],
  horizontalContourLines: number[],
  columns: AutoSelectionColumn[] = [],
  verticalContourLines: number[] = []
): AutoSelectionGridDetection => ({
  width,
  height,
  rows,
  columns,
  cells: columns.length > 0 ? buildCells(rows, columns) : [],
  contourLines: horizontalContourLines,
  horizontalContourLines,
  verticalContourLines,
});

const buildRowsFromContourLines = (width: number, height: number, contourLines: number[]): AutoSelectionGridDetection => {
  const rowEdges = [0, ...contourLines, height];

  const intervals = rowEdges.slice(0, -1).map((start, index) => {
    const end = rowEdges[index + 1];
    return {
      start,
      end: Math.max(start, end - 1),
    };
  });

  return makeDetection(width, height, buildRowsFromIntervals(width, intervals), contourLines);
};

const isLightGutterPixel = (data: Uint8ClampedArray, index: number) => {
  const alpha = data[index + 3];
  if (alpha <= 16) {
    return true;
  }

  const r = data[index];
  const g = data[index + 1];
  const b = data[index + 2];
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  return (min >= 218 && max - min <= 46) || (luminance >= 238 && max - min <= 70);
};

const getAxisGutterScores = (imageData: ImageData, axis: 'x' | 'y'): number[] => {
  const { data, width, height } = imageData;
  const primarySize = axis === 'x' ? width : height;
  const secondarySize = axis === 'x' ? height : width;
  const scores: number[] = [];

  for (let primary = 0; primary < primarySize; primary += 1) {
    let lightPixels = 0;

    for (let secondary = 0; secondary < secondarySize; secondary += 1) {
      const x = axis === 'x' ? primary : secondary;
      const y = axis === 'x' ? secondary : primary;
      const idx = (y * width + x) * 4;
      if (isLightGutterPixel(data, idx)) {
        lightPixels += 1;
      }
    }

    scores.push(lightPixels / secondarySize);
  }

  return scores;
};

const detectGutterBands = (scores: number[], size: number): Array<{ start: number; end: number; center: number }> => {
  if (scores.length === 0) {
    return [];
  }

  const strongestScore = Math.max(...scores);
  if (strongestScore < 0.42) {
    return [];
  }

  const threshold = strongestScore >= 0.92
    ? 0.52
    : clamp(strongestScore * 0.78, 0.38, 0.86);
  const rawBands: Array<{ start: number; end: number }> = [];
  let bandStart: number | null = null;

  scores.forEach((score, index) => {
    if (score >= threshold && bandStart === null) {
      bandStart = index;
    }

    if ((score < threshold || index === scores.length - 1) && bandStart !== null) {
      rawBands.push({ start: bandStart, end: score < threshold ? index - 1 : index });
      bandStart = null;
    }
  });

  const minBandWidth = Math.max(1, Math.round(size * 0.0015));
  const maxBandWidth = Math.max(5, Math.round(size * 0.04));

  return mergeCloseBands(rawBands, Math.max(1, Math.round(size * 0.002)))
    .filter((band) => {
      const width = band.end - band.start + 1;
      return width >= minBandWidth && width <= maxBandWidth;
    })
    .map((band) => ({
      ...band,
      center: Math.round((band.start + band.end) / 2),
    }));
};

const buildIntervalsFromGutters = (
  size: number,
  gutterBands: Array<{ start: number; end: number; center: number }>
): Array<{ start: number; end: number }> => {
  const intervals: Array<{ start: number; end: number }> = [];
  const minIntervalSize = Math.max(8, Math.round(size * 0.035));
  let cursor = 0;

  gutterBands.forEach((band) => {
    const end = band.start - 1;
    if (end - cursor + 1 >= minIntervalSize) {
      intervals.push({ start: cursor, end });
    }
    cursor = Math.max(cursor, band.end + 1);
  });

  if (size - cursor >= minIntervalSize) {
    intervals.push({ start: cursor, end: size - 1 });
  }

  return intervals;
};

const detectRowsAndColumnsFromLightGutters = (imageData: ImageData): AutoSelectionGridDetection | null => {
  const { width, height } = imageData;
  if (width < 48 || height < 48) {
    return null;
  }

  const verticalGutters = detectGutterBands(getAxisGutterScores(imageData, 'x'), width);
  const horizontalGutters = detectGutterBands(getAxisGutterScores(imageData, 'y'), height);
  const columnIntervals = buildIntervalsFromGutters(width, verticalGutters);
  const rowIntervals = buildIntervalsFromGutters(height, horizontalGutters);

  if (columnIntervals.length < 2 || rowIntervals.length < 2) {
    return null;
  }

  const rows = buildRowsFromIntervals(width, rowIntervals);
  const columns = buildColumnsFromIntervals(height, columnIntervals);

  return makeDetection(
    width,
    height,
    rows,
    horizontalGutters.map((band) => band.center),
    columns,
    verticalGutters.map((band) => band.center)
  );
};

const detectRowsFromActivityGaps = (imageData: ImageData): number[] => {
  const { height } = imageData;
  const activity = smoothActivity(buildRowActivity(imageData), Math.max(1, Math.round(height / 160)));
  const strongestRow = Math.max(...activity);
  if (strongestRow < 0.015) {
    return [];
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
    return [];
  }

  return mergedBands.slice(0, -1).map((band, index) => (
    Math.round((band.end + mergedBands[index + 1].start) / 2)
  ));
};

const detectRowsFromHorizontalSeams = (imageData: ImageData): number[] => {
  const { data, width, height } = imageData;
  if (height < 24 || width < 8) {
    return [];
  }

  const scores: number[] = [];
  for (let y = 1; y < height; y += 1) {
    let sum = 0;
    for (let x = 0; x < width; x += 1) {
      const prev = ((y - 1) * width + x) * 4;
      const current = (y * width + x) * 4;
      sum += Math.abs(data[current] - data[prev]);
      sum += Math.abs(data[current + 1] - data[prev + 1]);
      sum += Math.abs(data[current + 2] - data[prev + 2]);
      sum += Math.abs(data[current + 3] - data[prev + 3]) * 0.5;
    }
    scores.push(sum / width);
  }

  const strongestScore = Math.max(...scores);
  if (strongestScore < 42) {
    return [];
  }

  const threshold = Math.max(36, strongestScore * 0.72);
  const minRowHeight = Math.max(10, Math.round(height * 0.08));
  const candidates: Array<{ y: number; score: number }> = [];
  let groupStart: number | null = null;
  let bestY = 0;
  let bestScore = 0;

  scores.forEach((score, index) => {
    const y = index + 1;
    const isCandidate = score >= threshold && y >= minRowHeight && y <= height - minRowHeight;

    if (isCandidate && groupStart === null) {
      groupStart = y;
      bestY = y;
      bestScore = score;
    }

    if (isCandidate && score > bestScore) {
      bestY = y;
      bestScore = score;
    }

    if ((!isCandidate || index === scores.length - 1) && groupStart !== null) {
      candidates.push({ y: bestY, score: bestScore });
      groupStart = null;
      bestY = 0;
      bestScore = 0;
    }
  });

  return candidates
    .map((candidate) => candidate.y)
    .filter((lineY, index, lines) => index === 0 || lineY - lines[index - 1] >= minRowHeight);
};

export const detectAutoSelectionRows = (imageData: ImageData): AutoSelectionRowDetection => {
  const { width, height } = imageData;
  const emptyResult = makeDetection(width, height, [], []);
  if (width <= 0 || height <= 0) {
    return emptyResult;
  }

  const gridDetection = detectRowsAndColumnsFromLightGutters(imageData);
  if (gridDetection) {
    return gridDetection;
  }

  const contourLines = detectRowsFromActivityGaps(imageData);
  if (contourLines.length > 0) {
    return buildRowsFromContourLines(width, height, contourLines);
  }

  const seamLines = detectRowsFromHorizontalSeams(imageData);
  if (seamLines.length > 0) {
    return buildRowsFromContourLines(width, height, seamLines);
  }

  return emptyResult;
};

export const detectAutoSelectionGrid = detectAutoSelectionRows;

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

export const getAutoSelectionRowNearContour = (
  detection: AutoSelectionRowDetection,
  point: { x: number; y: number },
  tolerance: number
): AutoSelectionRow | null => {
  if (point.x < 0 || point.x > detection.width || point.y < 0 || point.y > detection.height) {
    return null;
  }

  let bestIndex = -1;
  let bestDistance = Infinity;
  detection.contourLines.forEach((lineY, index) => {
    const distance = Math.abs(point.y - lineY);
    if (distance <= tolerance && distance < bestDistance) {
      bestIndex = point.y >= lineY ? index + 1 : index;
      bestDistance = distance;
    }
  });

  return bestIndex >= 0 ? detection.rows[bestIndex] ?? null : null;
};

export const getAutoSelectionCellAtPoint = (
  detection: AutoSelectionGridDetection,
  point: { x: number; y: number }
): AutoSelectionCell | null => {
  if (
    point.x < 0 ||
    point.x > detection.width ||
    point.y < 0 ||
    point.y > detection.height ||
    detection.cells.length === 0
  ) {
    return null;
  }

  return detection.cells.find((cell) => (
    point.x >= cell.bounds.x &&
    point.x <= cell.bounds.x + cell.bounds.width &&
    point.y >= cell.bounds.y &&
    point.y <= cell.bounds.y + cell.bounds.height
  )) ?? null;
};
