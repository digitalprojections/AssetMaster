import assert from 'node:assert/strict';
import {
  MAX_KEY_EDGE_FADE_PERCENT,
  MAX_KEY_STRENGTH_PERCENT,
  MIN_KEY_EDGE_FADE_PERCENT,
  MIN_KEY_STRENGTH_PERCENT,
  applyKeyRemovalToAlpha,
  getKeyRemovalAmount,
  getRgbDistance,
  normalizeKeyEdgeFadePercent,
  normalizeKeyStrengthPercent,
} from '../src/utils/backgroundKeying';

assert.equal(normalizeKeyStrengthPercent(-1), MIN_KEY_STRENGTH_PERCENT);
assert.equal(normalizeKeyStrengthPercent(1), 1);
assert.equal(normalizeKeyStrengthPercent(87.4), 87);
assert.equal(normalizeKeyStrengthPercent(500), MAX_KEY_STRENGTH_PERCENT);
assert.equal(normalizeKeyEdgeFadePercent(-1), MIN_KEY_EDGE_FADE_PERCENT);
assert.equal(normalizeKeyEdgeFadePercent(37.8), 38);
assert.equal(normalizeKeyEdgeFadePercent(500), MAX_KEY_EDGE_FADE_PERCENT);

assert.equal(getRgbDistance({ r: 10, g: 20, b: 30 }, { r: 10, g: 20, b: 30 }), 0);

assert.equal(applyKeyRemovalToAlpha({
  alpha: 255,
  distance: 0,
  tolerance: 40,
  strengthPercent: 100,
  edgeFadePercent: 0,
}), 0);

assert.equal(applyKeyRemovalToAlpha({
  alpha: 255,
  distance: 0,
  tolerance: 40,
  strengthPercent: 50,
  edgeFadePercent: 0,
}), 128);

assert.equal(applyKeyRemovalToAlpha({
  alpha: 255,
  distance: 90,
  tolerance: 100,
  strengthPercent: 100,
  edgeFadePercent: 0,
}), 0);

assert.equal(applyKeyRemovalToAlpha({
  alpha: 255,
  distance: 90,
  tolerance: 100,
  strengthPercent: 100,
  edgeFadePercent: 50,
}), 204);

assert.equal(getKeyRemovalAmount({
  distance: 110,
  tolerance: 100,
  strengthPercent: 100,
  edgeFadePercent: 50,
}), 0);

assert.equal(applyKeyRemovalToAlpha({
  alpha: 180,
  distance: 110,
  tolerance: 100,
  strengthPercent: 100,
  edgeFadePercent: 50,
}), 180);

console.log('background keying tests passed');
