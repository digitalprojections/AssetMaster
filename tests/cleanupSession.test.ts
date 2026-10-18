import assert from 'node:assert/strict';
import test from 'node:test';
import { readBorderDetection, saveBorderDetection } from '../src/utils/cleanupSession';

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
