export type RgbColor = {
  r: number;
  g: number;
  b: number;
};

export const MIN_KEY_STRENGTH_PERCENT = 0;
export const MAX_KEY_STRENGTH_PERCENT = 100;
export const MIN_KEY_EDGE_FADE_PERCENT = 0;
export const MAX_KEY_EDGE_FADE_PERCENT = 100;

const clampNumber = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
};

export const normalizeKeyStrengthPercent = (value: number): number => (
  clampNumber(value, MIN_KEY_STRENGTH_PERCENT, MAX_KEY_STRENGTH_PERCENT)
);

export const normalizeKeyEdgeFadePercent = (value: number): number => (
  clampNumber(value, MIN_KEY_EDGE_FADE_PERCENT, MAX_KEY_EDGE_FADE_PERCENT)
);

export const getRgbDistance = (color: RgbColor, targetColor: RgbColor): number => (
  Math.sqrt(
    Math.pow(color.r - targetColor.r, 2) +
    Math.pow(color.g - targetColor.g, 2) +
    Math.pow(color.b - targetColor.b, 2)
  )
);

export const getKeyRemovalAmount = ({
  distance,
  tolerance,
  strengthPercent,
  edgeFadePercent,
}: {
  distance: number;
  tolerance: number;
  strengthPercent: number;
  edgeFadePercent: number;
}): number => {
  if (distance > tolerance) {
    return 0;
  }

  const strength = normalizeKeyStrengthPercent(strengthPercent) / 100;
  const fade = normalizeKeyEdgeFadePercent(edgeFadePercent) / 100;
  if (tolerance <= 0 || fade === 0) {
    return strength;
  }

  const fadeStart = tolerance * (1 - fade);
  if (distance <= fadeStart) {
    return strength;
  }

  const fadeRange = Math.max(1, tolerance - fadeStart);
  const fadeWeight = Math.max(0, 1 - ((distance - fadeStart) / fadeRange));
  return strength * fadeWeight;
};

export const applyKeyRemovalToAlpha = ({
  alpha,
  distance,
  tolerance,
  strengthPercent,
  edgeFadePercent,
}: {
  alpha: number;
  distance: number;
  tolerance: number;
  strengthPercent: number;
  edgeFadePercent: number;
}): number => {
  if (alpha <= 0) {
    return 0;
  }

  const removalAmount = getKeyRemovalAmount({
    distance,
    tolerance,
    strengthPercent,
    edgeFadePercent,
  });

  return Math.max(0, Math.min(255, Math.round(alpha * (1 - removalAmount))));
};
