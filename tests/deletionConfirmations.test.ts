import assert from 'node:assert/strict';
import test from 'node:test';
import { readDeletionConfirmations, saveDeletionConfirmations, setGroupConfirmations, areGroupConfirmationsMuted, getMutedFrameAction } from '../src/utils/deletionConfirmations';

test('confirmation silence is opt-in and scoped to unique source groups', () => {
  const original = {};
  const muted = setGroupConfirmations(original, ['input:first'], true, 'both');
  assert.equal(areGroupConfirmationsMuted(original, ['input:first']), false);
  assert.equal(areGroupConfirmationsMuted(muted, ['input:first']), true);
  assert.equal(areGroupConfirmationsMuted(muted, ['input:second']), false);
  assert.equal(areGroupConfirmationsMuted(muted, ['input:first', 'input:second']), false);
  assert.equal(areGroupConfirmationsMuted(muted, []), false);
  assert.deepEqual(original, {});
});

test('timeline silence remembers the action and does not bypass shared-source protection', () => {
  const muted = setGroupConfirmations({}, ['a'], true, 'both');
  assert.equal(getMutedFrameAction(muted, 'a', true), 'both');
  assert.equal(getMutedFrameAction(muted, 'a', false), null);
  assert.equal(getMutedFrameAction(muted, 'b', true), null);
  assert.equal(getMutedFrameAction(setGroupConfirmations({}, ['a'], true, 'timeline'), 'a', false), 'timeline');
});

test('confirmations can be enabled again without changing other groups', () => {
  const muted = setGroupConfirmations({}, ['a', 'b'], true);
  const enabled = setGroupConfirmations(muted, ['a'], false);
  assert.equal(areGroupConfirmationsMuted(enabled, ['a']), false);
  assert.equal(areGroupConfirmationsMuted(enabled, ['b']), true);
  assert.equal(areGroupConfirmationsMuted(muted, ['a']), true);
});

test('preferences persist, validate saved data, and handle unavailable storage', () => {
  let value = '';
  const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
  const preferences = setGroupConfirmations({}, ['a'], true, 'both');
  assert.equal(saveDeletionConfirmations(storage, preferences), true);
  assert.deepEqual(readDeletionConfirmations(storage), preferences);
  value = '{"a":{"frameAction":"invalid"},"b":{"frameAction":"timeline"}}';
  assert.deepEqual(readDeletionConfirmations(storage), { b: { frameAction: 'timeline' } });
  value = 'broken'; assert.deepEqual(readDeletionConfirmations(storage), {});
  assert.deepEqual(readDeletionConfirmations(undefined), {});
  assert.equal(saveDeletionConfirmations(undefined, preferences), false);
  const blocked = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('blocked'); } };
  assert.deepEqual(readDeletionConfirmations(blocked), {});
  assert.equal(saveDeletionConfirmations(blocked, preferences), false);
});
