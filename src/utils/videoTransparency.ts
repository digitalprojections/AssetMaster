import { applyKeyRemovalToAlpha, type RgbColor } from './backgroundKeying';

export type VideoBackgroundMode = 'preserve' | 'auto' | 'color';

export const parseVideoKeyColor = (hex: string): RgbColor => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('Choose a valid background color.');
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
};

/** Sample a bounded number of border pixels; select the dominant color bucket.
 * Resolve once on the first selected frame so moving subjects do not change the key.
 */
export const detectVideoBackgroundColor = (data: Uint8ClampedArray, width: number, height: number): RgbColor | null => {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || data.length !== width * height * 4) {
    throw new Error('Invalid video frame dimensions.');
  }
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  const sample = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 128) return;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count++; bucket.r += r; bucket.g += g; bucket.b += b;
    buckets.set(key, bucket);
  };
  const steps = Math.min(128, Math.max(width, height));
  for (let n = 0; n < steps; n++) {
    const x = Math.round(n * (width - 1) / Math.max(1, steps - 1));
    const y = Math.round(n * (height - 1) / Math.max(1, steps - 1));
    sample(x, 0); sample(x, height - 1); sample(0, y); sample(width - 1, y);
  }
  let best: { count: number; r: number; g: number; b: number } | undefined;
  for (const bucket of buckets.values()) if (!best || bucket.count > best.count) best = bucket;
  return best ? { r: Math.round(best.r / best.count), g: Math.round(best.g / best.count), b: Math.round(best.b / best.count) } : null;
};

/** In-place alpha-only operation; preserve mode skips pixel readback entirely in the caller. */
export const removeVideoBackground = (data: Uint8ClampedArray, key: RgbColor | null, tolerance: number, edgeFadePercent: number): void => {
  if (!key) return;
  const limit = Number.isFinite(tolerance) ? Math.min(442, Math.max(0, tolerance)) : 0;
  const limitSquared = limit * limit;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i] - key.r, g = data[i + 1] - key.g, b = data[i + 2] - key.b;
    const squared = r * r + g * g + b * b;
    if (squared > limitSquared) continue;
    data[i + 3] = applyKeyRemovalToAlpha({ alpha: data[i + 3], distance: Math.sqrt(squared), tolerance: limit, strengthPercent: 100, edgeFadePercent });
  }
};
