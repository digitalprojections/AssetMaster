import assert from 'node:assert/strict';
import test from 'node:test';
import { readUsageTipsPreference, saveUsageTipsPreference } from '../src/utils/usageTips';

test('tips are initially visible and remember an explicit dismissal', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  assert.equal(readUsageTipsPreference(storage, 'animation'), true);
  saveUsageTipsPreference(storage, 'animation', false);
  assert.equal(readUsageTipsPreference(storage, 'animation'), false);
  assert.equal(readUsageTipsPreference(storage, 'collage'), true);
  saveUsageTipsPreference(storage, 'animation', true);
  assert.equal(readUsageTipsPreference(storage, 'animation'), true);
});

test('unavailable or blocked preference storage does not break the studio', () => {
  assert.equal(readUsageTipsPreference(undefined, 'animation'), true);
  assert.doesNotThrow(() => saveUsageTipsPreference(undefined, 'animation', false));
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  assert.equal(readUsageTipsPreference(blocked, 'animation'), true);
  assert.doesNotThrow(() => saveUsageTipsPreference(blocked, 'animation', false));
});
