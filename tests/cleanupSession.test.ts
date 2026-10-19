import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CLEANUP_SETTINGS, normalizeCleanupSettings, readCleanupSettings, saveCleanupSettings, readBorderDetection, saveBorderDetection } from '../src/utils/cleanupSession';

test('Border Detection defaults on and remembers a change in session storage', () => {
  let value: string | null = null;
  const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
  assert.equal(readBorderDetection(storage), true);
  saveBorderDetection(storage, false);
  assert.equal(value, 'false');
  assert.equal(readBorderDetection(storage), false);
  saveBorderDetection(storage, true);
  assert.equal(readBorderDetection(storage), true);
});

test('blocked session storage keeps the choice in memory while cleanup is reopened', () => {
  const blocked = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
  saveBorderDetection(blocked, false);
  assert.equal(readBorderDetection(blocked), false);
  assert.equal(readBorderDetection(undefined), false);
  saveBorderDetection(undefined, true);
});


test('all cleanup preferences survive reopening and a fresh storage read', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const settings = { activeTool: 'eraser' as const, eraserMode: 'color-match' as const, magicTolerance: 80,
    keyStrengthPercent: 65, keyEdgeFadePercent: 20, magicBrushSize: 24, brushSize: 40, shaveWidth: 4,
    manualKeyColor: '#12ab34', panMode: true, viewZoom: 2.75 };
  saveCleanupSettings(storage, settings);
  assert.deepEqual(readCleanupSettings(storage), settings);
  assert.deepEqual(readCleanupSettings(undefined), settings);
  assert.deepEqual(JSON.parse([...values.values()][0]), settings);
});

test('cleanup settings reject invalid types, ranges, colors, and unknown fields', () => {
  const invalid = { activeTool: 'unknown', eraserMode: 'unknown', magicTolerance: -1, keyStrengthPercent: 101,
    keyEdgeFadePercent: '25', magicBrushSize: 1, brushSize: 61, shaveWidth: 7,
    manualKeyColor: 'invalid', panMode: 'true', viewZoom: 13, image: 'private image' };
  assert.deepEqual(normalizeCleanupSettings(invalid), DEFAULT_CLEANUP_SETTINGS);
  assert.deepEqual(normalizeCleanupSettings(null), DEFAULT_CLEANUP_SETTINGS);
  assert.deepEqual(normalizeCleanupSettings({ magicTolerance: 0, keyStrengthPercent: 0, keyEdgeFadePercent: 0, viewZoom: 1 }),
    { ...DEFAULT_CLEANUP_SETTINGS, magicTolerance: 0, keyStrengthPercent: 0, keyEdgeFadePercent: 0 });
});

test('blocked or corrupt storage preserves the last cleanup preferences', () => {
  const blocked = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
  const settings = { ...DEFAULT_CLEANUP_SETTINGS, brushSize: 28 };
  saveCleanupSettings(blocked, settings);
  assert.deepEqual(readCleanupSettings(blocked), settings);
  assert.deepEqual(readCleanupSettings({ getItem: () => '{broken' }), settings);
  saveCleanupSettings(undefined, DEFAULT_CLEANUP_SETTINGS);
});
